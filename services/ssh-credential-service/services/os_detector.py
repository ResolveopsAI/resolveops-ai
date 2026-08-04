import boto3
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class OSDetector:
    """
    Detects the operating system of an EC2 instance from its AMI metadata
    and resolves the correct SSH username.
    
    The PEM file stays the same regardless of OS — only the SSH user changes.
    """

    # AMI name/description patterns → SSH user mapping
    # Order matters: more specific patterns first
    OS_USER_MAP = [
        ('ubuntu', 'ubuntu'),
        ('debian', 'admin'),
        ('centos', 'centos'),
        ('rhel', 'ec2-user'),
        ('red hat', 'ec2-user'),
        ('suse', 'ec2-user'),
        ('sles', 'ec2-user'),
        ('fedora', 'fedora'),
        ('bitnami', 'bitnami'),
        ('amazon', 'ec2-user'),
        ('amzn', 'ec2-user'),
        ('al2023', 'ec2-user'),
        ('arch', 'arch'),
        ('freebsd', 'ec2-user'),
        ('windows', None),  # Windows — no SSH
    ]

    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def _get_ec2_client(self, region: str):
        kwargs = self.auth_kwargs.copy()
        kwargs['region_name'] = region
        return boto3.client('ec2', **kwargs)

    def detect(self, instance_id: str, region: str) -> Dict:
        """
        Detect the OS and resolve the SSH user for an EC2 instance.
        
        Returns:
            {
                'instance_id': 'i-xxx',
                'ami_id': 'ami-xxx',
                'ami_name': 'ubuntu/images/...',
                'detected_os': 'ubuntu',
                'ssh_user': 'ubuntu',
                'platform': 'Linux/UNIX',
                'is_windows': False
            }
        """
        ec2 = self._get_ec2_client(region)

        try:
            response = ec2.describe_instances(InstanceIds=[instance_id])
            instance = response['Reservations'][0]['Instances'][0]
        except Exception as e:
            logger.error(f"Failed to describe instance {instance_id}: {e}")
            return {
                'instance_id': instance_id,
                'ami_id': None,
                'ami_name': None,
                'detected_os': 'unknown',
                'ssh_user': 'ec2-user',  # Safe default
                'platform': 'unknown',
                'is_windows': False,
                'error': str(e)
            }

        image_id = instance.get('ImageId')
        platform = instance.get('PlatformDetails', '')
        platform_field = instance.get('Platform', '')  # 'windows' or empty

        # Quick check: if Platform field says 'windows'
        if platform_field and 'windows' in platform_field.lower():
            return {
                'instance_id': instance_id,
                'ami_id': image_id,
                'ami_name': None,
                'detected_os': 'windows',
                'ssh_user': None,
                'platform': platform,
                'is_windows': True,
                'message': 'Windows instances do not support SSH-based self-healing.'
            }

        # Describe the AMI for name/description
        ami_name = ''
        ami_desc = ''
        try:
            ami_response = ec2.describe_images(ImageIds=[image_id])
            if ami_response['Images']:
                ami = ami_response['Images'][0]
                ami_name = ami.get('Name', '')
                ami_desc = ami.get('Description', '')
        except Exception as e:
            logger.warning(f"Could not describe AMI {image_id}: {e}")

        # Match against OS patterns
        detected_os, ssh_user = self._match_os(ami_name, ami_desc, platform)

        return {
            'instance_id': instance_id,
            'ami_id': image_id,
            'ami_name': ami_name,
            'detected_os': detected_os,
            'ssh_user': ssh_user,
            'platform': platform,
            'is_windows': ssh_user is None
        }

    def _match_os(self, ami_name: str, ami_desc: str, platform: str) -> tuple:
        """Match AMI metadata against known OS patterns."""
        search_text = f"{ami_name} {ami_desc} {platform}".lower()

        for pattern, user in self.OS_USER_MAP:
            if pattern in search_text:
                return pattern, user

        # Default fallback
        logger.info(f"Could not detect OS from AMI info. Defaulting to ec2-user. "
                     f"AMI name: {ami_name}")
        return 'unknown', 'ec2-user'

    def detect_batch(self, instance_ids: list, region: str) -> Dict[str, Dict]:
        """
        Detect OS for multiple instances in a single batch.
        Returns a dict keyed by instance_id.
        """
        results = {}
        ec2 = self._get_ec2_client(region)

        try:
            response = ec2.describe_instances(InstanceIds=instance_ids)
        except Exception as e:
            logger.error(f"Batch describe failed: {e}")
            for iid in instance_ids:
                results[iid] = {
                    'instance_id': iid,
                    'detected_os': 'unknown',
                    'ssh_user': 'ec2-user',
                    'is_windows': False,
                    'error': str(e)
                }
            return results

        # Collect all unique AMI IDs for batch describe
        instance_map = {}  # instance_id -> instance_data
        ami_ids = set()

        for reservation in response['Reservations']:
            for instance in reservation['Instances']:
                iid = instance['InstanceId']
                instance_map[iid] = instance
                if instance.get('ImageId'):
                    ami_ids.add(instance['ImageId'])

        # Batch describe AMIs
        ami_info = {}
        if ami_ids:
            try:
                ami_response = ec2.describe_images(ImageIds=list(ami_ids))
                for ami in ami_response['Images']:
                    ami_info[ami['ImageId']] = ami
            except Exception as e:
                logger.warning(f"Batch AMI describe failed: {e}")

        # Process each instance
        for iid, instance in instance_map.items():
            platform_field = instance.get('Platform', '')
            platform = instance.get('PlatformDetails', '')
            image_id = instance.get('ImageId', '')

            if platform_field and 'windows' in platform_field.lower():
                results[iid] = {
                    'instance_id': iid,
                    'ami_id': image_id,
                    'detected_os': 'windows',
                    'ssh_user': None,
                    'platform': platform,
                    'is_windows': True
                }
                continue

            ami = ami_info.get(image_id, {})
            ami_name = ami.get('Name', '')
            ami_desc = ami.get('Description', '')

            detected_os, ssh_user = self._match_os(ami_name, ami_desc, platform)

            results[iid] = {
                'instance_id': iid,
                'ami_id': image_id,
                'ami_name': ami_name,
                'detected_os': detected_os,
                'ssh_user': ssh_user,
                'platform': platform,
                'is_windows': ssh_user is None
            }

        # Handle any instances that weren't in the response
        for iid in instance_ids:
            if iid not in results:
                results[iid] = {
                    'instance_id': iid,
                    'detected_os': 'unknown',
                    'ssh_user': 'ec2-user',
                    'is_windows': False
                }

        return results
