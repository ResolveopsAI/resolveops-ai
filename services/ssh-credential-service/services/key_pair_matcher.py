import boto3
import logging
from typing import Dict, List, Tuple, Optional
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
import hashlib

logger = logging.getLogger(__name__)


class KeyPairMatcher:
    """
    Matches a stored PEM file against AWS EC2 key pairs and instances.
    
    Flow:
    1. Extract public key fingerprint from the PEM file
    2. List all key pairs in the AWS account via ec2.describe_key_pairs()
    3. Match fingerprint to find the AWS key pair name
    4. For each running EC2 instance, check if its key_name matches
    5. Return categorized lists: matched (can SSH) vs unmatched (need different PEM)
    """

    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def _get_ec2_client(self, region: str):
        kwargs = self.auth_kwargs.copy()
        kwargs['region_name'] = region
        return boto3.client('ec2', **kwargs)

    @staticmethod
    def get_pem_fingerprint_md5(pem_content: bytes) -> str:
        """
        Calculate the MD5 fingerprint that AWS uses for key pairs.
        AWS uses MD5 of the DER-encoded private key for imported key pairs,
        and SHA-1 of the DER-encoded public key for AWS-generated key pairs.
        We compute both formats for matching.
        """
        try:
            private_key = load_pem_private_key(pem_content, password=None)
            public_key_der = private_key.public_key().public_bytes(
                Encoding.DER, PublicFormat.SubjectPublicKeyInfo
            )
            # AWS fingerprint format for imported keys (MD5)
            md5_fp = hashlib.md5(public_key_der).hexdigest()
            # Format as colon-separated pairs
            md5_formatted = ':'.join(md5_fp[i:i+2] for i in range(0, len(md5_fp), 2))
            return md5_formatted
        except Exception as e:
            logger.error(f"Failed to compute MD5 fingerprint: {e}")
            raise

    @staticmethod
    def get_pem_fingerprint_sha1(pem_content: bytes) -> str:
        """
        Calculate SHA-1 fingerprint (used by AWS for AWS-generated key pairs).
        """
        try:
            from cryptography.hazmat.primitives.serialization import (
                Encoding as Enc, PrivateFormat, NoEncryption
            )
            private_key = load_pem_private_key(pem_content, password=None)
            # AWS-generated key pairs use SHA-1 of DER-encoded private key
            private_key_der = private_key.private_bytes(
                Enc.DER, PrivateFormat.TraditionalOpenSSL, NoEncryption()
            )
            sha1_fp = hashlib.sha1(private_key_der).hexdigest()
            sha1_formatted = ':'.join(sha1_fp[i:i+2] for i in range(0, len(sha1_fp), 2))
            return sha1_formatted
        except Exception as e:
            logger.error(f"Failed to compute SHA-1 fingerprint: {e}")
            raise

    def find_matching_key_pair(self, pem_content: bytes, region: str) -> Optional[Dict]:
        """
        Find the AWS key pair that matches the given PEM file.
        Returns the matching key pair dict or None.
        """
        ec2 = self._get_ec2_client(region)

        try:
            key_pairs = ec2.describe_key_pairs()['KeyPairs']
        except Exception as e:
            logger.error(f"Failed to describe key pairs: {e}")
            return None

        # Compute both fingerprint formats
        try:
            md5_fp = self.get_pem_fingerprint_md5(pem_content)
            sha1_fp = self.get_pem_fingerprint_sha1(pem_content)
        except Exception:
            return None

        for kp in key_pairs:
            aws_fp = kp.get('KeyFingerprint', '')
            if aws_fp == md5_fp or aws_fp == sha1_fp:
                logger.info(f"PEM matches AWS key pair: {kp['KeyName']}")
                return {
                    'key_name': kp['KeyName'],
                    'key_pair_id': kp.get('KeyPairId', ''),
                    'fingerprint': aws_fp,
                    'type': kp.get('KeyType', 'rsa')
                }

        logger.info("No matching AWS key pair found for the uploaded PEM")
        return None

    def match_instances(
        self, pem_content: bytes, region: str
    ) -> Tuple[List[Dict], List[Dict], Optional[str]]:
        """
        Match the PEM against all EC2 instances in the given region.
        
        Returns:
            matched_instances: List of instances accessible with this PEM
            unmatched_instances: List of instances that need a different PEM
            matched_key_name: The AWS key pair name matched (or None)
        """
        ec2 = self._get_ec2_client(region)

        # Step 1: Find the matching key pair
        matched_kp = self.find_matching_key_pair(pem_content, region)
        matched_key_name = matched_kp['key_name'] if matched_kp else None

        # Step 2: Get all instances
        matched_instances = []
        unmatched_instances = []

        try:
            paginator = ec2.get_paginator('describe_instances')
            for page in paginator.paginate():
                for reservation in page['Reservations']:
                    for instance in reservation['Instances']:
                        state = instance.get('State', {}).get('Name', '')
                        if state == 'terminated':
                            continue

                        inst_key = instance.get('KeyName')
                        inst_id = instance['InstanceId']
                        inst_info = {
                            'instance_id': inst_id,
                            'key_name': inst_key or 'No key pair',
                            'state': state,
                            'instance_type': instance.get('InstanceType', ''),
                            'private_ip': instance.get('PrivateIpAddress', ''),
                            'public_ip': instance.get('PublicIpAddress', ''),
                            'name': self._get_instance_name(instance),
                            'launch_time': str(instance.get('LaunchTime', ''))
                        }

                        if matched_key_name and inst_key == matched_key_name:
                            inst_info['self_healing_ready'] = True
                            matched_instances.append(inst_info)
                        else:
                            inst_info['self_healing_ready'] = False
                            inst_info['message'] = (
                                f"This instance uses key pair '{inst_key}', "
                                f"not the uploaded PEM. Upload the correct PEM to enable self-healing."
                                if inst_key
                                else "This instance has no key pair associated."
                            )
                            unmatched_instances.append(inst_info)

        except Exception as e:
            logger.error(f"Failed to describe instances: {e}")

        return matched_instances, unmatched_instances, matched_key_name

    @staticmethod
    def _get_instance_name(instance: Dict) -> str:
        """Extract the Name tag from an EC2 instance."""
        for tag in instance.get('Tags', []):
            if tag['Key'] == 'Name':
                return tag['Value']
        return ''
