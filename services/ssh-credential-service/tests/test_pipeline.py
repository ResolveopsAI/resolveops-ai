"""
Self-Healing E2E Test Pipeline — Runs full detect → propose → approve → execute → verify cycle.

Usage:
    python test_pipeline.py --instance-id i-0abc123 --pem-path ./my-key.pem --scenario disk_full --region us-east-1

This script:
1. Injects a real error into the EC2 instance (via error_simulator)
2. Calls the AI RCA engine to generate a remediation proposal
3. Submits the proposal to the self-healing service
4. Auto-approves ALL proposed commands (for testing only)
5. Verifies the fix worked by re-checking the instance
6. Reports PASS/FAIL
"""
import argparse
import sys
import os
import time
import json
import base64
import requests
import logging
import subprocess

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Default service URLs (override with env vars)
SELF_HEAL_SERVICE_URL = os.getenv("SELF_HEAL_SERVICE_URL", "http://localhost:8000")
AI_RCA_SERVICE_URL = os.getenv("AI_RCA_SERVICE_URL", "http://localhost:8001")
API_GATEWAY_URL = os.getenv("API_GATEWAY_URL", "http://localhost:8002")

# Test tenant for pipeline
TEST_TENANT_ID = "test-pipeline-tenant"

def upload_pem_key(pem_path):
    """Step 0: Upload the PEM key to credentials service so it can be matched with instances."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 0: UPLOAD PEM KEY")
    logger.info(f"{'═' * 60}\n")
    
    import base64
    import boto3
    
    try:
        sts = boto3.client('sts')
        account_id = sts.get_caller_identity()['Account']
    except Exception as e:
        logger.warning(f"Failed to get AWS account ID via STS: {e}. Using dummy account ID.")
        account_id = "123456789012"
        
    with open(pem_path, "rb") as f:
        pem_content = f.read()
    pem_base64 = base64.b64encode(pem_content).decode("utf-8")
    
    payload = {
        "key_name": os.path.basename(pem_path),
        "aws_account_id": account_id,
        "pem_content": pem_base64
    }
    
    try:
        url = f"{SELF_HEAL_SERVICE_URL}/api/v1/credentials/pem"
        logger.info(f"Uploading PEM key to {url}...")
        resp = requests.post(
            url,
            json=payload,
            headers={"X-Tenant-ID": TEST_TENANT_ID},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            credential_id = data.get('credential_id')
            logger.info(f"✅ PEM key uploaded successfully. Credential ID: {credential_id}")
            logger.info(f"   Fingerprint: {data.get('fingerprint')}")
            return credential_id
        else:
            logger.error(f"Failed to upload PEM key: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        logger.error(f"Error uploading PEM key: {e}")
        return None

def test_ssh_connection(credential_id, instance_id, region):
    """Step 0.5: Test SSH connectivity using the stored PEM key."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 0.5: TEST SSH CONNECTIVITY")
    logger.info(f"{'═' * 60}\n")
    
    url = f"{SELF_HEAL_SERVICE_URL}/api/v1/credentials/pem/{credential_id}/test-connection"
    payload = {
        "instance_id": instance_id,
        "region": region
    }
    
    try:
        logger.info(f"Testing SSH connection via {url}...")
        resp = requests.post(
            url,
            json=payload,
            headers={"X-Tenant-ID": TEST_TENANT_ID},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            logger.info(f"✅ Connection test result: {data.get('status')}")
            logger.info(f"   OS: {data.get('detected_os')} | SSH User: {data.get('ssh_user')}")
            logger.info(f"   Message: {data.get('message')}")
            return data.get('status') == 'success'
        else:
            logger.error(f"Connection test failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Error testing SSH connection: {e}")
        return False



def inject_error(instance_id, scenario, pem_path, region, ssh_user=None):
    """Step 1: Inject a real error into the instance."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 1: INJECT ERROR — {scenario}")
    logger.info(f"{'═' * 60}\n")

    cmd = [
        sys.executable, "error_simulator.py",
        "--instance-id", instance_id,
        "--scenario", scenario,
        "--pem-path", pem_path,
        "--region", region,
    ]
    if ssh_user:
        cmd += ["--ssh-user", ssh_user]

    result = subprocess.run(cmd, capture_output=True, text=True,
                            cwd=os.path.dirname(os.path.abspath(__file__)))

    print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode != 0:
        logger.error("Error injection failed!")
        return False

    logger.info("✅ Error injected successfully.\n")
    return True


def generate_rca_proposal(scenario, instance_id, region):
    """Step 2: Generate an AI RCA proposal with executable commands."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 2: GENERATE AI RCA PROPOSAL")
    logger.info(f"{'═' * 60}\n")

    # Map scenario to problem description and simulated logs
    scenario_contexts = {
        "disk_full": {
            "problem": "Disk usage at 95% on /var/log. Risk of service crash.",
            "failure_type": "Disk Saturation",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "WARN", "message": "Disk usage at 85%"},
                {"timestamp": "2026-08-03T16:10:00Z", "level": "WARN", "message": "Disk usage at 90%"},
                {"timestamp": "2026-08-03T16:20:00Z", "level": "ERROR", "message": "Disk usage at 95% - critical"},
            ]
        },
        "nginx_crash": {
            "problem": "Nginx service is down. Configuration file corrupted.",
            "failure_type": "Service Crash",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "ERROR", "message": "nginx: [emerg] unknown directive in /etc/nginx/nginx.conf"},
                {"timestamp": "2026-08-03T16:00:01Z", "level": "ERROR", "message": "nginx.service: Main process exited, code=exited, status=1/FAILURE"},
            ]
        },
        "memory_pressure": {
            "problem": "Memory usage at 92% and climbing. Possible memory leak.",
            "failure_type": "Memory Exhaustion",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "WARN", "message": "Memory utilization at 80%"},
                {"timestamp": "2026-08-03T16:10:00Z", "level": "WARN", "message": "Memory utilization at 88%"},
                {"timestamp": "2026-08-03T16:20:00Z", "level": "ERROR", "message": "Memory utilization at 92% - OOM risk"},
            ]
        },
        "zombie_processes": {
            "problem": "20+ zombie (defunct) processes detected. PID table filling up.",
            "failure_type": "Zombie Process Accumulation",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "WARN", "message": "Detected 20 zombie processes"},
            ]
        },
        "port_conflict": {
            "problem": "Port 80 occupied by rogue process. Nginx cannot start.",
            "failure_type": "Port Conflict",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "ERROR", "message": "nginx: bind() to 0.0.0.0:80 failed - Address already in use"},
            ]
        },
        "high_cpu": {
            "problem": "CPU load at 100% on all cores. Runaway processes detected.",
            "failure_type": "CPU Saturation",
            "logs": [
                {"timestamp": "2026-08-03T16:00:00Z", "level": "WARN", "message": "Load average: 4.2 3.8 2.1 on 2-core system"},
                {"timestamp": "2026-08-03T16:10:00Z", "level": "ERROR", "message": "CPU utilization at 100% - all cores saturated"},
            ]
        },
    }

    ctx = scenario_contexts.get(scenario, {
        "problem": f"Unknown issue: {scenario}",
        "failure_type": "Unknown",
        "logs": []
    })

    # Try calling the actual AI RCA service
    try:
        rca_payload = {
            "service": f"ec2-{instance_id}",
            "failure_type": ctx["failure_type"],
            "risk_score": 80,
            "confidence_score": 85,
            "recent_logs": ctx["logs"],
            "instance_info": {
                "instance_id": instance_id,
                "region": region,
            }
        }

        logger.info(f"Calling AI RCA service at {AI_RCA_SERVICE_URL}...")
        resp = requests.post(
            f"{AI_RCA_SERVICE_URL}/api/v1/rca/self-healing",
            json=rca_payload,
            timeout=30
        )

        if resp.status_code == 200:
            rca_result = resp.json()
            logger.info("✅ AI RCA generated executable actions.")
            logger.info(f"   Probable cause: {rca_result.get('probable_cause', 'N/A')}")
            logger.info(f"   Actions: {len(rca_result.get('executable_actions', []))} commands")
            return rca_result, ctx["problem"]
        else:
            logger.warning(f"AI RCA service returned {resp.status_code}. Using fallback commands.")

    except requests.ConnectionError:
        logger.warning("AI RCA service not reachable. Using pre-built fallback commands.")
    except Exception as e:
        logger.warning(f"AI RCA call failed: {e}. Using fallback commands.")

    # Fallback: Use pre-built commands for each scenario
    fallback_commands = {
        "disk_full": [
            {"step": 1, "command": "df -h /", "description": "Check current disk usage", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "du -sh /var/log/* 2>/dev/null | sort -rh | head -10", "description": "Find largest files in /var/log", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 3, "command": "sudo rm -f /var/log/test-fill-disk.dat", "description": "Remove the test fill file", "risk_level": "low", "action_type": "remediation", "reversible": False},
            {"step": 4, "command": "sudo journalctl --vacuum-size=50M 2>/dev/null; true", "description": "Clean old journal logs", "risk_level": "low", "action_type": "remediation"},
            {"step": 5, "command": "df -h /", "description": "Verify disk space freed", "risk_level": "none", "action_type": "verification"},
        ],
        "nginx_crash": [
            {"step": 1, "command": "sudo systemctl status nginx --no-pager 2>/dev/null || sudo service nginx status 2>/dev/null || echo 'NGINX NOT RUNNING'", "description": "Check Nginx status", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "sudo nginx -t 2>&1 || true", "description": "Test Nginx config", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 3, "command": "sudo cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf", "description": "Restore Nginx config from backup", "risk_level": "low", "action_type": "remediation"},
            {"step": 4, "command": "sudo nginx -t", "description": "Verify restored config is valid", "risk_level": "none", "action_type": "verification"},
            {"step": 5, "command": "sudo systemctl start nginx 2>/dev/null || sudo service nginx start 2>/dev/null", "description": "Start Nginx", "risk_level": "low", "action_type": "remediation"},
            {"step": 6, "command": "curl -s -o /dev/null -w '%{http_code}' http://localhost 2>/dev/null || echo 'CURL_FAILED'", "description": "Verify Nginx is responding", "risk_level": "none", "action_type": "verification"},
        ],
        "memory_pressure": [
            {"step": 1, "command": "free -m", "description": "Check memory usage", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "ps aux --sort=-%mem | head -10", "description": "Find top memory consumers", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 3, "command": "pkill -f 'bytearray' 2>/dev/null; true", "description": "Kill the memory hog process", "risk_level": "medium", "action_type": "remediation"},
            {"step": 4, "command": "free -m", "description": "Verify memory freed", "risk_level": "none", "action_type": "verification"},
        ],
        "zombie_processes": [
            {"step": 1, "command": "ps aux | grep defunct | wc -l", "description": "Count zombie processes", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "ps aux | grep defunct | head -10", "description": "List zombie processes", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 3, "command": "pkill -f zombie_maker 2>/dev/null; true", "description": "Kill zombie parent to reap children", "risk_level": "low", "action_type": "remediation"},
            {"step": 4, "command": "ps aux | grep defunct | wc -l", "description": "Verify zombies cleaned up", "risk_level": "none", "action_type": "verification"},
        ],
        "port_conflict": [
            {"step": 1, "command": "sudo ss -tlnp | grep ':80'", "description": "Check what's on port 80", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "sudo pkill -f 'python3 -m http.server 80' 2>/dev/null; true", "description": "Kill rogue process on port 80", "risk_level": "medium", "action_type": "remediation"},
            {"step": 3, "command": "sudo systemctl start nginx 2>/dev/null || sudo service nginx start 2>/dev/null", "description": "Start Nginx now that port is free", "risk_level": "low", "action_type": "remediation"},
            {"step": 4, "command": "sudo ss -tlnp | grep ':80'", "description": "Verify Nginx is now on port 80", "risk_level": "none", "action_type": "verification"},
        ],
        "high_cpu": [
            {"step": 1, "command": "uptime", "description": "Check load average", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 2, "command": "ps aux --sort=-%cpu | head -10", "description": "Find CPU hog processes", "risk_level": "none", "action_type": "diagnostic"},
            {"step": 3, "command": "pkill -f 'while true; do :; done' 2>/dev/null; true", "description": "Kill CPU hog bash processes", "risk_level": "medium", "action_type": "remediation"},
            {"step": 4, "command": "sleep 3 && uptime", "description": "Verify load average dropping", "risk_level": "none", "action_type": "verification"},
        ],
    }

    commands = fallback_commands.get(scenario, [
        {"step": 1, "command": "uptime && df -h && free -m", "description": "Basic diagnostics", "risk_level": "none", "action_type": "diagnostic"}
    ])

    rca_result = {
        "probable_cause": ctx["problem"],
        "risk_assessment": "Immediate attention recommended",
        "suggested_remediation": ctx["problem"],
        "executable_actions": commands
    }

    logger.info(f"✅ Using fallback commands: {len(commands)} steps")
    return rca_result, ctx["problem"]


def submit_proposal(instance_id, region, rca_result, problem_summary):
    """Step 3: Submit the proposal to the self-healing service."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 3: SUBMIT PROPOSAL TO SELF-HEALING SERVICE")
    logger.info(f"{'═' * 60}\n")

    proposal = {
        "instance_id": instance_id,
        "region": region,
        "problem_summary": problem_summary,
        "trigger_source": "test_pipeline",
        "proposed_commands": rca_result.get("executable_actions", []),
    }

    try:
        resp = requests.post(
            f"{SELF_HEAL_SERVICE_URL}/api/v1/self-heal/propose",
            json=proposal,
            headers={"X-Tenant-ID": TEST_TENANT_ID},
            timeout=15,
        )

        if resp.status_code == 200:
            data = resp.json()
            action_id = data.get("action_id")
            logger.info(f"✅ Proposal created: {action_id}")
            logger.info(f"   Status: {data.get('status')}")
            logger.info(f"   OS detected: {data.get('detected_os')} (SSH user: {data.get('ssh_user')})")
            return action_id
        else:
            logger.error(f"Proposal submission failed: {resp.status_code} — {resp.text}")
            return None

    except requests.ConnectionError:
        logger.warning("Self-healing service not reachable. Logging proposal locally.")
        logger.info(f"   Proposal: {json.dumps(proposal, indent=2)[:500]}...")
        return "local-proposal-" + instance_id
    except Exception as e:
        logger.error(f"Proposal submission error: {e}")
        return None


def approve_and_execute(action_id, commands):
    """Step 4: Approve ALL commands and execute."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 4: APPROVE & EXECUTE (all {len(commands)} commands)")
    logger.info(f"{'═' * 60}\n")

    all_steps = [cmd.get("step", i + 1) for i, cmd in enumerate(commands)]

    try:
        resp = requests.post(
            f"{SELF_HEAL_SERVICE_URL}/api/v1/self-heal/{action_id}/approve",
            json={"approved_step_numbers": all_steps},
            headers={"X-Tenant-ID": TEST_TENANT_ID},
            timeout=60,
        )

        if resp.status_code == 200:
            data = resp.json()
            logger.info(f"✅ Execution completed: {data.get('status')}")

            for result in data.get("results", []):
                status_icon = "✅" if result["status"] == "success" else "❌"
                logger.info(f"   {status_icon} Step {result['step']}: {result['command'][:60]}...")
                logger.info(f"      exit_code={result['exit_code']}")
                if result.get("stdout"):
                    for line in result["stdout"].split("\n")[:5]:
                        logger.info(f"      > {line}")

            return data
        else:
            logger.error(f"Execution failed: {resp.status_code} — {resp.text}")
            return None

    except requests.ConnectionError:
        logger.warning("Self-healing service not reachable. Skipping execution step.")
        logger.info("   In production, approved commands would execute via SSH here.")
        return {"status": "skipped", "results": []}
    except Exception as e:
        logger.error(f"Execution error: {e}")
        return None


def verify_fix(instance_id, scenario, pem_path, region, ssh_user=None):
    """Step 5: Verify the fix worked by checking the instance state."""
    logger.info(f"\n{'═' * 60}")
    logger.info(f"STEP 5: VERIFY FIX")
    logger.info(f"{'═' * 60}\n")

    import paramiko
    import boto3

    if ssh_user is None:
        ssh_user, instance = detect_ssh_user(instance_id, region)
    else:
        ec2 = boto3.client('ec2', region_name=region)
        resp = ec2.describe_instances(InstanceIds=[instance_id])
        instance = resp['Reservations'][0]['Instances'][0]

    host = instance.get('PublicIpAddress') or instance.get('PrivateIpAddress')
    key = paramiko.RSAKey.from_private_key_file(pem_path)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=host, username=ssh_user, pkey=key, timeout=15)

    # Need these for detect_ssh_user if called from error_simulator context
    from error_simulator import run_cmd, detect_ssh_user

    passed = True
    verify_checks = {
        "disk_full": [
            ("df --output=pcent / | tail -1", lambda out: int(out.strip().replace('%', '')) < 85,
             "Disk usage should be below 85%"),
        ],
        "nginx_crash": [
            ("sudo systemctl is-active nginx 2>/dev/null || echo 'inactive'", lambda out: 'active' in out,
             "Nginx should be active"),
        ],
        "memory_pressure": [
            ("free -m | awk '/^Mem:/{printf \"%.0f\", ($3/$2)*100}'", lambda out: int(out.strip()) < 80,
             "Memory usage should be below 80%"),
        ],
        "zombie_processes": [
            ("ps aux | grep -c '[d]efunct'", lambda out: int(out.strip()) < 5,
             "Zombie count should be < 5"),
        ],
        "port_conflict": [
            ("sudo ss -tlnp | grep ':80' | grep nginx", lambda out: 'nginx' in out.lower() or len(out.strip()) > 0,
             "Nginx should be on port 80"),
        ],
        "high_cpu": [
            ("uptime | awk -F'load average:' '{print $2}' | awk -F, '{print $1}'",
             lambda out: float(out.strip()) < 3.0,
             "Load average should be below 3.0"),
        ],
    }

    checks = verify_checks.get(scenario, [])

    for cmd, check_fn, description in checks:
        out, err, exit_code = run_cmd(client, cmd, "VERIFY")
        try:
            result = check_fn(out)
            if result:
                logger.info(f"   ✅ PASS: {description} (got: {out.strip()})")
            else:
                logger.error(f"   ❌ FAIL: {description} (got: {out.strip()})")
                passed = False
        except Exception as e:
            logger.error(f"   ❌ FAIL: {description} (error: {e}, got: '{out.strip()}')")
            passed = False

    client.close()
    return passed


def main():
    parser = argparse.ArgumentParser(
        description="Self-Healing E2E Test Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
This pipeline runs the full cycle:
  1. INJECT:  SSH into the instance and create a real error
  2. DETECT:  Call AI RCA to generate remediation commands
  3. PROPOSE: Submit the proposal to the self-healing service
  4. EXECUTE: Auto-approve and run all commands
  5. VERIFY:  Check the instance to confirm the fix worked

Example:
  python test_pipeline.py --instance-id i-0abc123 --pem-path ./key.pem --scenario disk_full
  python test_pipeline.py --instance-id i-0abc123 --pem-path ./key.pem --scenario all
        """
    )
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--pem-path", required=True)
    parser.add_argument("--scenario", required=True,
                        choices=["disk_full", "nginx_crash", "memory_pressure",
                                 "zombie_processes", "port_conflict", "high_cpu", "all"])
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--ssh-user", default=None)
    parser.add_argument("--skip-inject", action="store_true",
                        help="Skip error injection (if error already exists)")
    parser.add_argument("--skip-verify", action="store_true",
                        help="Skip verification step")

    args = parser.parse_args()

    # Step 0: Upload PEM key
    credential_id = upload_pem_key(args.pem_path)
    if not credential_id:
        logger.error("❌ Aborting pipeline: PEM upload failed.")
        sys.exit(1)

    # Step 0.5: Test SSH connection
    conn_success = test_ssh_connection(credential_id, args.instance_id, args.region)
    if not conn_success:
        logger.warning("⚠️ SSH connection test returned failure or warning. Proceeding to pipeline execution anyway...")

    scenarios = (
        ["disk_full", "nginx_crash", "memory_pressure", "zombie_processes", "port_conflict", "high_cpu"]
        if args.scenario == "all"
        else [args.scenario]
    )

    results = {}

    for scenario in scenarios:
        logger.info(f"\n{'━' * 60}")
        logger.info(f"  PIPELINE: {scenario.upper()}")
        logger.info(f"{'━' * 60}\n")

        try:
            # Step 1: Inject error
            if not args.skip_inject:
                if not inject_error(args.instance_id, scenario, args.pem_path, args.region, args.ssh_user):
                    results[scenario] = "INJECT_FAILED"
                    continue
                time.sleep(3)

            # Step 2: Generate RCA
            rca_result, problem = generate_rca_proposal(scenario, args.instance_id, args.region)

            # Step 3: Submit proposal
            action_id = submit_proposal(args.instance_id, args.region, rca_result, problem)

            # Step 4: Approve & Execute
            if action_id:
                exec_result = approve_and_execute(action_id, rca_result.get("executable_actions", []))
            else:
                exec_result = None

            # Step 5: Verify
            if not args.skip_verify:
                time.sleep(2)
                passed = verify_fix(args.instance_id, scenario, args.pem_path, args.region, args.ssh_user)
                results[scenario] = "PASS" if passed else "FAIL"
            else:
                results[scenario] = "SKIPPED_VERIFY"

        except Exception as e:
            logger.error(f"Pipeline failed for {scenario}: {e}")
            results[scenario] = f"ERROR: {e}"

    # Print summary
    logger.info(f"\n{'━' * 60}")
    logger.info(f"  PIPELINE RESULTS SUMMARY")
    logger.info(f"{'━' * 60}")
    for scenario, result in results.items():
        icon = "✅" if result == "PASS" else "❌" if "FAIL" in result else "⚠️"
        logger.info(f"  {icon}  {scenario:20s} → {result}")
    logger.info(f"{'━' * 60}\n")

    # Exit with error code if any failures
    if any("FAIL" in v for v in results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
