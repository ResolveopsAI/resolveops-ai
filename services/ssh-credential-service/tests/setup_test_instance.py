"""
EC2 Test Instance Setup — Provisions a test EC2 instance with common services pre-installed.

Usage:
    python setup_test_instance.py --key-pair-name my-key --region us-east-1

This launches a t3.micro instance with:
  - Nginx (for web server crash/restart scenarios)
  - Docker (for container OOMKill scenarios)
  - GCC (for zombie process scenarios)
  - Python3 (for memory hog scenarios)

The instance is tagged as a test instance for easy identification and cleanup.
"""
import argparse
import boto3
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# User data script — installs everything needed for testing
USER_DATA_UBUNTU = """#!/bin/bash
set -e

# Update system
apt-get update -qq

# Install test dependencies
apt-get install -y -qq nginx gcc python3 curl net-tools

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Start Nginx
systemctl enable nginx
systemctl start nginx

# Tag completion
echo "SETUP_COMPLETE" > /tmp/setup_complete.txt
"""

USER_DATA_AMAZON_LINUX = """#!/bin/bash
set -e

# Update system
yum update -y -q

# Install test dependencies
yum install -y -q nginx gcc python3 curl net-tools

# Install Docker
amazon-linux-extras install docker -y 2>/dev/null || yum install -y docker
systemctl enable docker
systemctl start docker

# Start Nginx
systemctl enable nginx
systemctl start nginx

echo "SETUP_COMPLETE" > /tmp/setup_complete.txt
"""


def find_latest_ami(ec2, ami_type="ubuntu"):
    """Find the latest Ubuntu or Amazon Linux 2 AMI."""
    if ami_type == "ubuntu":
        filters = [
            {"Name": "name", "Values": ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]},
            {"Name": "state", "Values": ["available"]},
            {"Name": "architecture", "Values": ["x86_64"]},
        ]
        owners = ["099720109477"]  # Canonical
    else:
        filters = [
            {"Name": "name", "Values": ["amzn2-ami-hvm-*-x86_64-gp2"]},
            {"Name": "state", "Values": ["available"]},
        ]
        owners = ["amazon"]

    images = ec2.describe_images(Owners=owners, Filters=filters)["Images"]
    images.sort(key=lambda x: x["CreationDate"], reverse=True)

    if not images:
        logger.error(f"No {ami_type} AMIs found!")
        return None

    ami = images[0]
    logger.info(f"Found AMI: {ami['ImageId']} — {ami['Name']}")
    return ami["ImageId"]


def create_security_group(ec2, vpc_id):
    """Create a security group that allows SSH (port 22) and HTTP (port 80)."""
    sg_name = "resolveops-self-healing-test"

    # Check if it already exists
    try:
        existing = ec2.describe_security_groups(
            Filters=[{"Name": "group-name", "Values": [sg_name]}]
        )
        if existing["SecurityGroups"]:
            sg_id = existing["SecurityGroups"][0]["GroupId"]
            logger.info(f"Security group already exists: {sg_id}")
            return sg_id
    except Exception:
        pass

    # Create new
    sg = ec2.create_security_group(
        GroupName=sg_name,
        Description="ResolveOps Self-Healing Test — SSH + HTTP access",
        VpcId=vpc_id,
    )
    sg_id = sg["GroupId"]

    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22,
             "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "SSH access for testing"}]},
            {"IpProtocol": "tcp", "FromPort": 80, "ToPort": 80,
             "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "HTTP access for testing"}]},
        ],
    )
    logger.info(f"Created security group: {sg_id} with SSH + HTTP rules")
    return sg_id


def launch_instance(ec2, ami_id, key_pair_name, sg_id, ami_type="ubuntu"):
    """Launch a test EC2 instance."""
    user_data = USER_DATA_UBUNTU if ami_type == "ubuntu" else USER_DATA_AMAZON_LINUX

    response = ec2.run_instances(
        ImageId=ami_id,
        InstanceType="t3.micro",
        KeyName=key_pair_name,
        SecurityGroupIds=[sg_id],
        MinCount=1,
        MaxCount=1,
        UserData=user_data,
        TagSpecifications=[{
            "ResourceType": "instance",
            "Tags": [
                {"Key": "Name", "Value": "ResolveOps-SelfHealing-Test"},
                {"Key": "Purpose", "Value": "self-healing-test"},
                {"Key": "ManagedBy", "Value": "resolveops"},
                {"Key": "AutoCleanup", "Value": "true"},
            ],
        }],
    )

    instance_id = response["Instances"][0]["InstanceId"]
    logger.info(f"Instance launched: {instance_id}")
    return instance_id


def wait_for_instance(ec2, instance_id):
    """Wait for the instance to be running and have a public IP."""
    logger.info("Waiting for instance to start...")
    waiter = ec2.get_waiter("instance_running")
    waiter.wait(InstanceIds=[instance_id])

    resp = ec2.describe_instances(InstanceIds=[instance_id])
    instance = resp["Reservations"][0]["Instances"][0]

    public_ip = instance.get("PublicIpAddress")
    private_ip = instance.get("PrivateIpAddress")

    logger.info(f"Instance is running!")
    logger.info(f"  Public IP:  {public_ip or 'N/A'}")
    logger.info(f"  Private IP: {private_ip}")

    return instance


def main():
    parser = argparse.ArgumentParser(description="Launch a test EC2 instance for self-healing testing")
    parser.add_argument("--key-pair-name", required=True, help="Name of the EC2 key pair to use")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--ami-type", default="ubuntu", choices=["ubuntu", "amazon-linux"],
                        help="AMI type (default: ubuntu)")
    args = parser.parse_args()

    ec2 = boto3.client("ec2", region_name=args.region)

    # Find latest AMI
    ami_id = find_latest_ami(ec2, args.ami_type)
    if not ami_id:
        return

    # Get default VPC
    vpcs = ec2.describe_vpcs(Filters=[{"Name": "is-default", "Values": ["true"]}])
    if not vpcs["Vpcs"]:
        logger.error("No default VPC found. Please specify a VPC.")
        return
    vpc_id = vpcs["Vpcs"][0]["VpcId"]

    # Create security group
    sg_id = create_security_group(ec2, vpc_id)

    # Launch instance
    instance_id = launch_instance(ec2, ami_id, args.key_pair_name, sg_id, args.ami_type)

    # Wait for it
    instance = wait_for_instance(ec2, instance_id)

    logger.info("")
    logger.info("=" * 60)
    logger.info("TEST INSTANCE READY")
    logger.info("=" * 60)
    logger.info(f"  Instance ID:  {instance_id}")
    logger.info(f"  Public IP:    {instance.get('PublicIpAddress', 'N/A')}")
    logger.info(f"  Key Pair:     {args.key_pair_name}")
    logger.info(f"  AMI Type:     {args.ami_type}")
    logger.info(f"  SSH User:     {'ubuntu' if args.ami_type == 'ubuntu' else 'ec2-user'}")
    logger.info("")
    logger.info("Wait ~2 minutes for user-data to finish installing packages, then run:")
    logger.info("")
    logger.info(f"  # Inject a single error:")
    logger.info(f"  python error_simulator.py --instance-id {instance_id} --pem-path ./{args.key_pair_name}.pem --scenario disk_full")
    logger.info("")
    logger.info(f"  # Run full E2E pipeline:")
    logger.info(f"  python test_pipeline.py --instance-id {instance_id} --pem-path ./{args.key_pair_name}.pem --scenario disk_full")
    logger.info("")
    logger.info(f"  # Run ALL scenarios:")
    logger.info(f"  python test_pipeline.py --instance-id {instance_id} --pem-path ./{args.key_pair_name}.pem --scenario all")
    logger.info("")
    logger.info(f"  # Cleanup all errors:")
    logger.info(f"  python error_simulator.py --instance-id {instance_id} --pem-path ./{args.key_pair_name}.pem --scenario cleanup")
    logger.info("")
    logger.info(f"  # Terminate instance when done:")
    logger.info(f"  aws ec2 terminate-instances --instance-ids {instance_id} --region {args.region}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
