"""
EC2 Error Simulator — Injects real errors into EC2 instances for testing self-healing.

Usage:
    python error_simulator.py --instance-id i-0abc123 --scenario disk_full --pem-path ./my-key.pem --region us-east-1

This script SSHes into a real EC2 instance and deliberately creates the error condition.
Then you can use the self-healing dashboard to detect and fix it.
"""
import argparse
import sys
import io
import time
import boto3
import paramiko
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# OS Detection (reused from the service)
# ──────────────────────────────────────────────

OS_USER_MAP = [
    ('ubuntu', 'ubuntu'), ('debian', 'admin'), ('centos', 'centos'),
    ('rhel', 'ec2-user'), ('amzn', 'ec2-user'), ('amazon', 'ec2-user'),
    ('al2023', 'ec2-user'), ('fedora', 'fedora'), ('suse', 'ec2-user'),
]


def detect_ssh_user(instance_id, region):
    """Auto-detect the SSH user from the instance's AMI."""
    ec2 = boto3.client('ec2', region_name=region)
    resp = ec2.describe_instances(InstanceIds=[instance_id])
    instance = resp['Reservations'][0]['Instances'][0]

    platform = instance.get('Platform', '')
    if 'windows' in platform.lower():
        logger.error("Windows instances are not supported.")
        sys.exit(1)

    image_id = instance.get('ImageId')
    try:
        ami = ec2.describe_images(ImageIds=[image_id])['Images'][0]
        ami_name = ami.get('Name', '').lower()
    except Exception:
        ami_name = ''

    for pattern, user in OS_USER_MAP:
        if pattern in ami_name:
            return user, instance
    return 'ec2-user', instance


def get_ssh_client(host, pem_path, ssh_user):
    """Establish an SSH connection."""
    key = paramiko.RSAKey.from_private_key_file(pem_path)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=ssh_user, pkey=key, timeout=15)
    return client


def run_cmd(client, command, label=""):
    """Run a command and print output."""
    logger.info(f"[{label}] Running: {command}")
    stdin, stdout, stderr = client.exec_command(command, timeout=30)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        logger.info(f"[{label}] stdout:\n{out}")
    if err:
        logger.warning(f"[{label}] stderr:\n{err}")
    logger.info(f"[{label}] exit_code: {exit_code}")
    return out, err, exit_code


# ──────────────────────────────────────────────
# ERROR SCENARIOS
# ──────────────────────────────────────────────

def scenario_disk_full(client):
    """
    SCENARIO: Disk Full
    Creates a large file to fill up /var/log to ~95%.
    The self-healing system should detect this and propose cleanup.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: Disk Full — Filling /var/log with junk data")
    logger.info("=" * 60)

    # Check current disk usage
    run_cmd(client, "df -h /", "BEFORE")

    # Create a large file to eat up disk space (fills to ~90%)
    # Calculate available space and fill most of it
    out, _, _ = run_cmd(client, "df --output=avail / | tail -1", "CALC")
    avail_kb = int(out.strip())
    fill_kb = int(avail_kb * 0.85)  # Fill 85% of remaining space
    fill_mb = fill_kb // 1024

    logger.info(f"Available: {avail_kb}KB, filling with {fill_mb}MB of junk data...")

    run_cmd(client,
            f"sudo dd if=/dev/zero of=/var/log/test-fill-disk.dat bs=1M count={fill_mb} 2>/dev/null",
            "FILL")

    # Verify the damage
    run_cmd(client, "df -h /", "AFTER")
    logger.info("✅ Disk is now nearly full. Use Self-Healing to fix it.")
    logger.info("   Expected fix: Delete /var/log/test-fill-disk.dat and clean old logs")


def scenario_nginx_crash(client):
    """
    SCENARIO: Nginx Crash
    Installs Nginx (if not present), starts it, then corrupts the config to crash it.
    The self-healing system should detect the failed service and propose a restart.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: Nginx Crash — Corrupting Nginx config")
    logger.info("=" * 60)

    # Install nginx if not present
    run_cmd(client, "which nginx || sudo apt-get update -qq && sudo apt-get install -y -qq nginx 2>/dev/null || sudo yum install -y nginx 2>/dev/null", "INSTALL")

    # Start nginx normally first
    run_cmd(client, "sudo systemctl start nginx 2>/dev/null || sudo service nginx start 2>/dev/null", "START")
    run_cmd(client, "sudo systemctl status nginx --no-pager 2>/dev/null || sudo service nginx status 2>/dev/null", "STATUS-BEFORE")

    # Backup config, then break it
    run_cmd(client, "sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup", "BACKUP")
    run_cmd(client, "echo 'BROKEN CONFIG {{{' | sudo tee /etc/nginx/nginx.conf > /dev/null", "BREAK")

    # Force reload — this will fail and crash nginx
    run_cmd(client, "sudo nginx -t 2>&1 || true", "TEST-BROKEN")
    run_cmd(client, "sudo systemctl stop nginx 2>/dev/null || sudo service nginx stop 2>/dev/null", "STOP")

    run_cmd(client, "sudo systemctl status nginx --no-pager 2>/dev/null || sudo service nginx status 2>/dev/null", "STATUS-AFTER")

    logger.info("✅ Nginx is now crashed with a broken config.")
    logger.info("   Expected fix: Restore config backup and restart nginx")
    logger.info("   Hint: sudo cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf && sudo systemctl start nginx")


def scenario_memory_pressure(client):
    """
    SCENARIO: Memory Pressure
    Spawns a process that consumes most of available memory.
    The self-healing system should detect high memory usage and propose killing it.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: Memory Pressure — Spawning memory hog process")
    logger.info("=" * 60)

    run_cmd(client, "free -m", "BEFORE")

    # Spawn a background process that allocates memory
    # Uses python to allocate ~70% of available RAM
    out, _, _ = run_cmd(client, "free -m | awk '/^Mem:/{print $7}'", "CALC")
    avail_mb = int(out.strip())
    alloc_mb = int(avail_mb * 0.75)

    logger.info(f"Available: {avail_mb}MB, allocating {alloc_mb}MB...")

    # Python one-liner that grabs memory and holds it
    cmd = (
        f"nohup python3 -c \""
        f"import time; "
        f"data = bytearray({alloc_mb} * 1024 * 1024); "
        f"print('Memory hog running, holding {alloc_mb}MB'); "
        f"time.sleep(3600)\" "
        f"> /tmp/memhog.log 2>&1 &"
    )
    run_cmd(client, cmd, "SPAWN")

    time.sleep(2)
    run_cmd(client, "free -m", "AFTER")
    run_cmd(client, "ps aux --sort=-%mem | head -5", "TOP-MEM")

    logger.info("✅ Memory is now under pressure. Use Self-Healing to fix it.")
    logger.info("   Expected fix: Kill the python3 memory hog process")


def scenario_zombie_processes(client):
    """
    SCENARIO: Zombie Processes
    Creates zombie processes that consume PID slots.
    The self-healing system should detect and clean them up.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: Zombie Processes — Creating zombie process tree")
    logger.info("=" * 60)

    run_cmd(client, "ps aux | grep -c defunct || echo '0 zombies'", "BEFORE")

    # Create a C program that spawns zombies, compile and run it
    zombie_code = r'''
#include <stdlib.h>
#include <unistd.h>
int main() {
    int i;
    for (i = 0; i < 20; i++) {
        if (fork() == 0) _exit(0);
    }
    sleep(3600);
    return 0;
}
'''
    run_cmd(client, f"echo '{zombie_code}' > /tmp/zombie_maker.c", "WRITE")
    run_cmd(client, "gcc /tmp/zombie_maker.c -o /tmp/zombie_maker 2>/dev/null || cc /tmp/zombie_maker.c -o /tmp/zombie_maker", "COMPILE")
    run_cmd(client, "nohup /tmp/zombie_maker > /dev/null 2>&1 &", "SPAWN")

    time.sleep(2)
    run_cmd(client, "ps aux | grep defunct | head -10", "AFTER")

    logger.info("✅ Zombie processes created. Use Self-Healing to fix it.")
    logger.info("   Expected fix: Kill the parent process to reap zombies")


def scenario_port_conflict(client):
    """
    SCENARIO: Port Conflict
    Starts a rogue process on port 80, which will prevent Nginx from starting.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: Port Conflict — Blocking port 80")
    logger.info("=" * 60)

    # Stop nginx first if running
    run_cmd(client, "sudo systemctl stop nginx 2>/dev/null; sudo service nginx stop 2>/dev/null; true", "STOP-NGINX")

    # Start a python HTTP server on port 80 to block it
    run_cmd(client,
            "sudo nohup python3 -m http.server 80 --directory /tmp > /tmp/rogue_http.log 2>&1 &",
            "BLOCK-PORT")

    time.sleep(1)
    run_cmd(client, "sudo ss -tlnp | grep ':80'", "PORT-CHECK")

    # Try to start nginx — it will fail
    out, err, code = run_cmd(client,
                              "sudo systemctl start nginx 2>&1 || sudo service nginx start 2>&1 || echo 'NGINX_FAILED'",
                              "NGINX-START")

    logger.info("✅ Port 80 is blocked by a rogue process. Nginx cannot start.")
    logger.info("   Expected fix: Kill the rogue python process on port 80, then start nginx")


def scenario_high_cpu(client):
    """
    SCENARIO: CPU Saturation
    Spawns CPU-intensive processes to spike load average.
    """
    logger.info("=" * 60)
    logger.info("SCENARIO: CPU Saturation — Spawning CPU hogs")
    logger.info("=" * 60)

    run_cmd(client, "uptime", "BEFORE")

    # Get CPU count and spawn that many stress processes
    out, _, _ = run_cmd(client, "nproc", "CPUS")
    num_cpus = int(out.strip()) if out.strip().isdigit() else 2

    # Spawn CPU burners
    for i in range(num_cpus):
        run_cmd(client,
                "nohup bash -c 'while true; do :; done' > /dev/null 2>&1 &",
                f"CPU-HOG-{i+1}")

    time.sleep(3)
    run_cmd(client, "uptime", "AFTER")
    run_cmd(client, "ps aux --sort=-%cpu | head -5", "TOP-CPU")

    logger.info(f"✅ {num_cpus} CPU hog processes spawned. Load average will spike.")
    logger.info("   Expected fix: Kill the bash CPU hog processes")


def scenario_full_cleanup(client):
    """
    CLEANUP: Remove all injected errors from a test instance.
    Run this after testing to restore the instance to a clean state.
    """
    logger.info("=" * 60)
    logger.info("CLEANUP: Removing all injected test errors")
    logger.info("=" * 60)

    # Remove disk fill file
    run_cmd(client, "sudo rm -f /var/log/test-fill-disk.dat", "DISK")

    # Restore nginx config
    run_cmd(client, "sudo cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf 2>/dev/null; true", "NGINX-CONFIG")
    run_cmd(client, "sudo systemctl start nginx 2>/dev/null; true", "NGINX-START")

    # Kill memory hog
    run_cmd(client, "pkill -f 'bytearray' 2>/dev/null; true", "MEMHOG")

    # Kill zombie maker
    run_cmd(client, "pkill -f zombie_maker 2>/dev/null; true", "ZOMBIES")
    run_cmd(client, "rm -f /tmp/zombie_maker /tmp/zombie_maker.c", "ZOMBIE-FILES")

    # Kill rogue port blocker
    run_cmd(client, "sudo pkill -f 'python3 -m http.server 80' 2>/dev/null; true", "PORT-BLOCK")

    # Kill CPU hogs
    run_cmd(client, "pkill -f 'while true; do :; done' 2>/dev/null; true", "CPU-HOGS")

    run_cmd(client, "df -h / && free -m && uptime", "FINAL-STATE")
    logger.info("✅ Cleanup complete. Instance should be back to normal.")


# ──────────────────────────────────────────────
# SCENARIO REGISTRY
# ──────────────────────────────────────────────

SCENARIOS = {
    "disk_full":         ("Fill disk to ~95% with junk data", scenario_disk_full),
    "nginx_crash":       ("Corrupt Nginx config and crash it", scenario_nginx_crash),
    "memory_pressure":   ("Spawn a process that eats 75% of RAM", scenario_memory_pressure),
    "zombie_processes":  ("Create 20 zombie processes", scenario_zombie_processes),
    "port_conflict":     ("Block port 80 with a rogue process", scenario_port_conflict),
    "high_cpu":          ("Spike CPU load to 100% on all cores", scenario_high_cpu),
    "cleanup":           ("Remove all injected errors", scenario_full_cleanup),
    "all":               ("Run ALL error scenarios (except cleanup)", None),
}


def main():
    parser = argparse.ArgumentParser(
        description="EC2 Error Simulator — Inject real errors into EC2 instances for self-healing testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Available scenarios:
  disk_full         Fill disk to ~95%% with junk data
  nginx_crash       Corrupt Nginx config and crash it
  memory_pressure   Spawn a process that eats 75%% of RAM
  zombie_processes  Create 20 zombie processes
  port_conflict     Block port 80 with a rogue process
  high_cpu          Spike CPU load to 100%% on all cores
  cleanup           Remove ALL injected errors (run after testing)
  all               Run ALL error scenarios (except cleanup)

Examples:
  python error_simulator.py --instance-id i-0abc123 --scenario disk_full --pem-path ./my-key.pem
  python error_simulator.py --instance-id i-0abc123 --scenario all --pem-path ./my-key.pem
  python error_simulator.py --instance-id i-0abc123 --scenario cleanup --pem-path ./my-key.pem
        """
    )
    parser.add_argument("--instance-id", required=True, help="EC2 Instance ID")
    parser.add_argument("--scenario", required=True, choices=SCENARIOS.keys(), help="Error scenario to inject")
    parser.add_argument("--pem-path", required=True, help="Path to PEM file for SSH")
    parser.add_argument("--region", default="us-east-1", help="AWS region (default: us-east-1)")
    parser.add_argument("--ssh-user", default=None, help="Override SSH user (auto-detected if not set)")

    args = parser.parse_args()

    # Detect SSH user and get instance details
    logger.info(f"Connecting to instance {args.instance_id} in {args.region}...")

    if args.ssh_user:
        ssh_user = args.ssh_user
        ec2 = boto3.client('ec2', region_name=args.region)
        resp = ec2.describe_instances(InstanceIds=[args.instance_id])
        instance = resp['Reservations'][0]['Instances'][0]
    else:
        ssh_user, instance = detect_ssh_user(args.instance_id, args.region)

    host = instance.get('PublicIpAddress') or instance.get('PrivateIpAddress')
    if not host:
        logger.error("Instance has no IP address. Is it running?")
        sys.exit(1)

    state = instance.get('State', {}).get('Name', 'unknown')
    if state != 'running':
        logger.error(f"Instance is {state}, not running.")
        sys.exit(1)

    logger.info(f"Instance: {args.instance_id}")
    logger.info(f"Host: {host}")
    logger.info(f"SSH User: {ssh_user} (auto-detected)")
    logger.info(f"Key Pair: {instance.get('KeyName', 'N/A')}")
    logger.info(f"State: {state}")
    logger.info("")

    # Connect via SSH
    client = get_ssh_client(host, args.pem_path, ssh_user)
    logger.info("SSH connection established.\n")

    try:
        if args.scenario == "all":
            for name, (desc, func) in SCENARIOS.items():
                if name in ("all", "cleanup") or func is None:
                    continue
                logger.info(f"\n{'─' * 60}")
                logger.info(f"Running scenario: {name} — {desc}")
                logger.info(f"{'─' * 60}\n")
                func(client)
                time.sleep(2)
        else:
            desc, func = SCENARIOS[args.scenario]
            func(client)
    finally:
        client.close()
        logger.info("\nSSH connection closed.")

    logger.info("\n" + "=" * 60)
    logger.info("DONE. Now go to the Self-Healing Dashboard to fix these issues!")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
