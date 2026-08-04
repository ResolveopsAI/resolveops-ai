import io
import logging
import paramiko
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class SSHExecutor:
    """
    Executes approved remediation commands on EC2 instances via SSH.
    
    DESIGN PHILOSOPHY:
    - The AI is UNRESTRICTED in what it can propose.
    - The HUMAN decides what gets executed (approval step happens before this).
    - This executor is a transparent pipe — it runs exactly what was approved.
    - All commands and outputs are logged in the audit trail.
    - Execution stops on first failure to prevent cascading damage.
    """

    DEFAULT_TIMEOUT = 30  # seconds per command
    CONNECT_TIMEOUT = 15  # seconds for SSH connection

    def execute(
        self,
        host: str,
        pem_content: bytes,
        ssh_user: str,
        commands: List[Dict],
        timeout: int = DEFAULT_TIMEOUT,
        stop_on_failure: bool = True
    ) -> List[Dict]:
        """
        Execute a list of approved commands on a remote host via SSH.
        
        Args:
            host: IP address or hostname of the target instance
            pem_content: Decrypted PEM private key bytes
            ssh_user: SSH username (auto-detected from OS)
            commands: List of command dicts with 'step' and 'command' keys
            timeout: Timeout per command in seconds
            stop_on_failure: If True, stop executing on first non-zero exit code
            
        Returns:
            List of result dicts with stdout, stderr, exit_code per command
        """
        results = []
        client = None

        try:
            # Load the PEM key
            key = self._load_pem_key(pem_content)

            # Establish SSH connection
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            logger.info(f"Connecting to {ssh_user}@{host}")
            client.connect(
                hostname=host,
                username=ssh_user,
                pkey=key,
                timeout=self.CONNECT_TIMEOUT,
                look_for_keys=False,
                allow_agent=False
            )
            logger.info(f"SSH connection established to {host}")

            # Execute commands sequentially
            for cmd_entry in commands:
                step = cmd_entry.get('step', 0)
                command = cmd_entry.get('command', '')

                if not command.strip():
                    results.append({
                        'step': step,
                        'command': command,
                        'stdout': '',
                        'stderr': 'Empty command — skipped',
                        'exit_code': -1,
                        'status': 'skipped'
                    })
                    continue

                logger.info(f"Executing step {step}: {command[:100]}...")

                try:
                    stdin, stdout, stderr = client.exec_command(
                        command, timeout=timeout
                    )
                    exit_code = stdout.channel.recv_exit_status()

                    stdout_text = stdout.read().decode('utf-8', errors='replace')
                    stderr_text = stderr.read().decode('utf-8', errors='replace')

                    # Truncate very long outputs to prevent DB bloat
                    max_output_len = 50000  # 50KB per output
                    if len(stdout_text) > max_output_len:
                        stdout_text = stdout_text[:max_output_len] + "\n... [output truncated]"
                    if len(stderr_text) > max_output_len:
                        stderr_text = stderr_text[:max_output_len] + "\n... [output truncated]"

                    status = 'success' if exit_code == 0 else 'failed'

                    results.append({
                        'step': step,
                        'command': command,
                        'stdout': stdout_text,
                        'stderr': stderr_text,
                        'exit_code': exit_code,
                        'status': status
                    })

                    logger.info(f"Step {step} completed with exit code {exit_code}")

                    # Stop on failure if configured
                    if exit_code != 0 and stop_on_failure:
                        logger.warning(
                            f"Step {step} failed (exit code {exit_code}). "
                            f"Stopping execution chain."
                        )
                        break

                except paramiko.SSHException as e:
                    logger.error(f"SSH error on step {step}: {e}")
                    results.append({
                        'step': step,
                        'command': command,
                        'stdout': '',
                        'stderr': f"SSH execution error: {str(e)}",
                        'exit_code': -1,
                        'status': 'error'
                    })
                    if stop_on_failure:
                        break

                except Exception as e:
                    logger.error(f"Unexpected error on step {step}: {e}")
                    results.append({
                        'step': step,
                        'command': command,
                        'stdout': '',
                        'stderr': f"Unexpected error: {str(e)}",
                        'exit_code': -1,
                        'status': 'error'
                    })
                    if stop_on_failure:
                        break

        except paramiko.AuthenticationException as e:
            logger.error(f"SSH authentication failed for {ssh_user}@{host}: {e}")
            results.append({
                'step': 0,
                'command': '[connection]',
                'stdout': '',
                'stderr': f"SSH authentication failed: {str(e)}. "
                          f"Verify the PEM key matches this instance.",
                'exit_code': -1,
                'status': 'auth_failed'
            })

        except paramiko.SSHException as e:
            logger.error(f"SSH connection error to {host}: {e}")
            results.append({
                'step': 0,
                'command': '[connection]',
                'stdout': '',
                'stderr': f"SSH connection error: {str(e)}",
                'exit_code': -1,
                'status': 'connection_failed'
            })

        except TimeoutError:
            logger.error(f"SSH connection timed out to {host}")
            results.append({
                'step': 0,
                'command': '[connection]',
                'stdout': '',
                'stderr': f"SSH connection timed out after {self.CONNECT_TIMEOUT}s. "
                          f"Check security groups and network ACLs.",
                'exit_code': -1,
                'status': 'timeout'
            })

        except Exception as e:
            logger.error(f"Unexpected error connecting to {host}: {e}")
            results.append({
                'step': 0,
                'command': '[connection]',
                'stdout': '',
                'stderr': f"Unexpected connection error: {str(e)}",
                'exit_code': -1,
                'status': 'error'
            })

        finally:
            if client:
                try:
                    client.close()
                    logger.info(f"SSH connection to {host} closed")
                except Exception:
                    pass

        return results

    def test_connection(
        self, host: str, pem_content: bytes, ssh_user: str
    ) -> Dict:
        """
        Test SSH connectivity to an instance without running any commands.
        Returns connection status and basic host info.
        """
        client = None
        try:
            key = self._load_pem_key(pem_content)

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                hostname=host,
                username=ssh_user,
                pkey=key,
                timeout=self.CONNECT_TIMEOUT,
                look_for_keys=False,
                allow_agent=False
            )

            # Run a simple command to verify
            stdin, stdout, stderr = client.exec_command("hostname && uname -a", timeout=10)
            exit_code = stdout.channel.recv_exit_status()
            output = stdout.read().decode('utf-8', errors='replace').strip()

            return {
                'status': 'success',
                'message': f'SSH connection successful to {ssh_user}@{host}',
                'host_info': output,
                'ssh_user': ssh_user
            }

        except paramiko.AuthenticationException:
            return {
                'status': 'auth_failed',
                'message': f'Authentication failed for {ssh_user}@{host}. '
                           f'PEM key does not match this instance.',
                'ssh_user': ssh_user
            }
        except TimeoutError:
            return {
                'status': 'timeout',
                'message': f'Connection timed out to {host}. '
                           f'Check security groups allow SSH (port 22).',
                'ssh_user': ssh_user
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Connection failed: {str(e)}',
                'ssh_user': ssh_user
            }
        finally:
            if client:
                try:
                    client.close()
                except Exception:
                    pass

    @staticmethod
    def _load_pem_key(pem_content: bytes):
        """Load PEM key content into a Paramiko key object."""
        key_file = io.BytesIO(pem_content)
        try:
            return paramiko.RSAKey.from_private_key(key_file)
        except paramiko.SSHException:
            key_file.seek(0)
            try:
                return paramiko.Ed25519Key.from_private_key(key_file)
            except Exception:
                key_file.seek(0)
                try:
                    return paramiko.ECDSAKey.from_private_key(key_file)
                except Exception:
                    raise ValueError(
                        "Unsupported PEM key type. Supported: RSA, Ed25519, ECDSA."
                    )
