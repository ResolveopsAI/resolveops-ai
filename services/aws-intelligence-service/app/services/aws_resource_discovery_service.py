import boto3
import logging
from typing import List, Dict
from app.utils.aws_resource_normalizer import normalize_aws_resource

logger = logging.getLogger(__name__)

class AWSResourceDiscoveryService:
    def __init__(self, auth_kwargs: Dict):
        """
        auth_kwargs: Dictionary containing boto3 client initialization kwargs.
        Example: {'aws_access_key_id': '...', 'aws_secret_access_key': '...', 'region_name': 'us-east-1'}
        """
        self.auth_kwargs = auth_kwargs
        
        # We need account ID for generating ARNs manually if they aren't provided by the API
        try:
            sts = boto3.client('sts', **self.auth_kwargs)
            self.account_id = sts.get_caller_identity().get("Account")
        except Exception:
            self.account_id = "unknown"

    def _get_client(self, service_name: str, region: str):
        kwargs = self.auth_kwargs.copy()
        kwargs['region_name'] = region
        return boto3.client(service_name, **kwargs)

    def scan_regions(self, regions: List[str]) -> tuple[List[Dict], List[Dict]]:
        """
        Scans specified regions for AWS resources and returns (resources, warnings).
        """
        all_resources = []
        all_warnings = []
        
        def append_results(results_tuple):
            res, warns = results_tuple
            all_resources.extend(res)
            all_warnings.extend(warns)

        for region in regions:
            logger.info(f"Scanning region: {region}")
            # EC2 & VPC
            append_results(self._scan_vpcs(region))
            append_results(self._scan_subnets(region))
            append_results(self._scan_security_groups(region))
            append_results(self._scan_ec2(region))
            append_results(self._scan_ebs(region))
            append_results(self._scan_eip(region))
            
            # Application
            append_results(self._scan_rds(region))
            append_results(self._scan_eks(region))
            append_results(self._scan_lambda(region))
            append_results(self._scan_elbv2(region))
            
            # Management
            append_results(self._scan_alarms(region))
            
            # S3 (Global, but handled appropriately in scanner)
            append_results(self._scan_s3(region))
            
        return all_resources, all_warnings

    def _format_warning(self, service: str, error: Exception) -> Dict:
        """Helper to format warnings consistently."""
        code = "UnknownError"
        if hasattr(error, 'response') and error.response:
            code = error.response.get('Error', {}).get('Code', 'UnknownError')
        elif "AccessDenied" in str(error):
            code = "AccessDenied"
        elif "NoCredentialsError" in str(error):
            code = "NoCredentialsError"
            
        return {
            "service": service,
            "code": code,
            "message": str(error)
        }

    def _scan_vpcs(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_vpcs()
            for vpc in response.get('Vpcs', []):
                vpc_id = vpc.get('VpcId')
                tags = {t['Key']: t['Value'] for t in vpc.get('Tags', [])}
                name = tags.get('Name', vpc_id)
                arn = f"arn:aws:ec2:{region}:{self.account_id}:vpc/{vpc_id}"
                
                resources.append(normalize_aws_resource(
                    account_id=self.account_id,
                    region=region,
                    resource_type="AWS::EC2::VPC",
                    resource_name=name,
                    arn=arn,
                    status=vpc.get('State', 'unknown'),
                    tags=tags,
                    metadata={"cidr_block": vpc.get('CidrBlock')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan VPCs in {region}: {e}")
            warnings.append(self._format_warning("ec2_vpc", e))
        return resources, warnings

    def _scan_ec2(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        logger.info(f"scanning region: {region}")
        logger.info("EC2 describe_instances started")
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_instances()
            for reservation in response.get('Reservations', []):
                for instance in reservation.get('Instances', []):
                    instance_id = instance.get('InstanceId')
                    tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}
                    name = tags.get('Name', instance_id)
                    arn = f"arn:aws:ec2:{region}:{self.account_id}:instance/{instance_id}"
                    
                    resources.append(normalize_aws_resource(
                        account_id=self.account_id,
                        region=region,
                        resource_type="AWS::EC2::Instance",
                        resource_name=name,
                        arn=arn,
                        status=instance.get('State', {}).get('Name', 'unknown'),
                        created_at=instance.get('LaunchTime'),
                        tags=tags,
                        metadata={
                            "instance_type": instance.get('InstanceType'),
                            "vpc_id": instance.get('VpcId'),
                            "subnet_id": instance.get('SubnetId'),
                            "private_ip": instance.get('PrivateIpAddress'),
                            "public_ip": instance.get('PublicIpAddress'),
                            "launch_time": instance.get('LaunchTime').isoformat() if hasattr(instance.get('LaunchTime'), 'isoformat') else str(instance.get('LaunchTime', '')),
                            "architecture": instance.get('Architecture', 'x86_64'),
                            "platform": instance.get('PlatformDetails', 'Linux/UNIX'),
                            "key_name": instance.get('KeyName', 'Default-KeyPair'),
                            "availability_zone": instance.get('Placement', {}).get('AvailabilityZone', f"{region}a"),
                            "ami_id": instance.get('ImageId', 'ami-09206705e3ed8b539'),
                            "state_transition_reason": instance.get('StateTransitionReason', 'User initiated')
                        }
                    ))
            logger.info(f"EC2 instances found count: {len(resources)}")
        except Exception as e:
            logger.error(f"Failed to scan EC2 instances in {region}: {e}")
            warnings.append(self._format_warning("ec2", e))
        return resources, warnings

    def _scan_s3(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            from botocore.exceptions import ClientError
            s3 = self._get_client('s3', region)
            
            # Only list buckets once (when region is us-east-1) to avoid duplicates, 
            # or filter appropriately. For simplicity, we just check if region is us-east-1.
            if region != 'us-east-1':
                return resources, warnings
                
            response = s3.list_buckets()
            for bucket in response.get('Buckets', []):
                name = bucket.get('Name')
                arn = f"arn:aws:s3:::{name}"
                
                metadata = {
                    "versioning": "unknown",
                    "encryption": "unknown",
                    "public_access_block": "unknown",
                    "policy_status": "unknown"
                }
                
                # Best effort fetching configuration
                try:
                    vers = s3.get_bucket_versioning(Bucket=name)
                    metadata["versioning"] = vers.get("Status", "Suspended")
                except ClientError: pass
                
                try:
                    enc = s3.get_bucket_encryption(Bucket=name)
                    rules = enc.get('ServerSideEncryptionConfiguration', {}).get('Rules', [])
                    if rules:
                        metadata["encryption"] = "enabled"
                except ClientError: pass
                
                try:
                    pab = s3.get_public_access_block(Bucket=name)
                    conf = pab.get('PublicAccessBlockConfiguration', {})
                    if conf.get('BlockPublicAcls') and conf.get('BlockPublicPolicy'):
                        metadata["public_access_block"] = "enabled"
                    else:
                        metadata["public_access_block"] = "disabled"
                except ClientError: pass
                
                try:
                    pol = s3.get_bucket_policy_status(Bucket=name)
                    is_public = pol.get('PolicyStatus', {}).get('IsPublic', False)
                    metadata["policy_status"] = "public" if is_public else "private"
                except ClientError: pass
                
                resources.append(normalize_aws_resource(
                    account_id=self.account_id,
                    region="global",
                    resource_type="AWS::S3::Bucket",
                    resource_name=name,
                    arn=arn,
                    status="available",
                    created_at=bucket.get('CreationDate'),
                    metadata=metadata
                ))
        except Exception as e:
            logger.error(f"Failed to scan S3 buckets: {e}")
            warnings.append(self._format_warning("s3", e))
        return resources, warnings

    def _scan_rds(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            rds = self._get_client('rds', region)
            response = rds.describe_db_instances()
            for db in response.get('DBInstances', []):
                name = db.get('DBInstanceIdentifier')
                arn = db.get('DBInstanceArn')
                
                resources.append(normalize_aws_resource(
                    account_id=self.account_id,
                    region=region,
                    resource_type="AWS::RDS::DBInstance",
                    resource_name=name,
                    arn=arn,
                    status=db.get('DBInstanceStatus', 'unknown'),
                    created_at=db.get('InstanceCreateTime'),
                    metadata={
                        "engine": db.get('Engine'),
                        "engine_version": db.get('EngineVersion'),
                        "instance_class": db.get('DBInstanceClass'),
                        "publicly_accessible": db.get('PubliclyAccessible', False)
                    }
                ))
        except Exception as e:
            logger.error(f"Failed to scan RDS instances in {region}: {e}")
            warnings.append(self._format_warning("rds", e))
        return resources, warnings

    def _scan_eks(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            eks = self._get_client('eks', region)
            response = eks.list_clusters()
            for cluster_name in response.get('clusters', []):
                try:
                    cluster_info = eks.describe_cluster(name=cluster_name).get('cluster', {})
                    arn = cluster_info.get('arn')
                    
                    resources.append(normalize_aws_resource(
                        account_id=self.account_id,
                        region=region,
                        resource_type="AWS::EKS::Cluster",
                        resource_name=cluster_name,
                        arn=arn,
                        status=cluster_info.get('status', 'unknown'),
                        created_at=cluster_info.get('createdAt'),
                        tags=cluster_info.get('tags', {}),
                        metadata={
                            "version": cluster_info.get('version'),
                            "endpoint": cluster_info.get('endpoint'),
                            "role_arn": cluster_info.get('roleArn')
                        }
                    ))
                except Exception as ce:
                    logger.error(f"Failed to describe EKS cluster {cluster_name}: {ce}")
        except Exception as e:
            logger.error(f"Failed to scan EKS clusters in {region}: {e}")
            warnings.append(self._format_warning("eks", e))
        return resources, warnings

    def _scan_subnets(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_subnets()
            for sn in response.get('Subnets', []):
                sn_id = sn.get('SubnetId')
                tags = {t['Key']: t['Value'] for t in sn.get('Tags', [])}
                name = tags.get('Name', sn_id)
                arn = f"arn:aws:ec2:{region}:{self.account_id}:subnet/{sn_id}"
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::EC2::Subnet",
                    resource_name=name, arn=arn, status=sn.get('State', 'unknown'), tags=tags,
                    metadata={"vpc_id": sn.get('VpcId'), "cidr_block": sn.get('CidrBlock')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan subnets in {region}: {e}")
            warnings.append(self._format_warning("ec2_subnet", e))
        return resources, warnings

    def _scan_security_groups(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_security_groups()
            for sg in response.get('SecurityGroups', []):
                sg_id = sg.get('GroupId')
                tags = {t['Key']: t['Value'] for t in sg.get('Tags', [])}
                name = tags.get('Name', sg.get('GroupName'))
                arn = f"arn:aws:ec2:{region}:{self.account_id}:security-group/{sg_id}"
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::EC2::SecurityGroup",
                    resource_name=name, arn=arn, status="available", tags=tags,
                    metadata={"vpc_id": sg.get('VpcId'), "description": sg.get('Description'), "ip_permissions": sg.get('IpPermissions', [])}
                ))
        except Exception as e:
            logger.error(f"Failed to scan SGs in {region}: {e}")
            warnings.append(self._format_warning("ec2_sg", e))
        return resources, warnings

    def _scan_ebs(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_volumes()
            for vol in response.get('Volumes', []):
                vol_id = vol.get('VolumeId')
                tags = {t['Key']: t['Value'] for t in vol.get('Tags', [])}
                name = tags.get('Name', vol_id)
                arn = f"arn:aws:ec2:{region}:{self.account_id}:volume/{vol_id}"
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::EC2::Volume",
                    resource_name=name, arn=arn, status=vol.get('State', 'unknown'), created_at=vol.get('CreateTime'), tags=tags,
                    metadata={"size": vol.get('Size'), "volume_type": vol.get('VolumeType'), "encrypted": vol.get('Encrypted')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan EBS in {region}: {e}")
            warnings.append(self._format_warning("ec2_ebs", e))
        return resources, warnings

    def _scan_eip(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            ec2 = self._get_client('ec2', region)
            response = ec2.describe_addresses()
            for eip in response.get('Addresses', []):
                alloc_id = eip.get('AllocationId')
                tags = {t['Key']: t['Value'] for t in eip.get('Tags', [])}
                name = tags.get('Name', eip.get('PublicIp'))
                arn = f"arn:aws:ec2:{region}:{self.account_id}:eip-allocation/{alloc_id}"
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::EC2::EIP",
                    resource_name=name, arn=arn, status="in-use" if eip.get('AssociationId') else "unassociated", tags=tags,
                    metadata={"public_ip": eip.get('PublicIp'), "instance_id": eip.get('InstanceId')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan EIP in {region}: {e}")
            warnings.append(self._format_warning("ec2_eip", e))
        return resources, warnings

    def _scan_lambda(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            lmd = self._get_client('lambda', region)
            response = lmd.list_functions()
            for func in response.get('Functions', []):
                name = func.get('FunctionName')
                arn = func.get('FunctionArn')
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::Lambda::Function",
                    resource_name=name, arn=arn, status=func.get('State', 'Active'),
                    metadata={"runtime": func.get('Runtime'), "timeout": func.get('Timeout')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan Lambda in {region}: {e}")
            warnings.append(self._format_warning("lambda", e))
        return resources, warnings

    def _scan_elbv2(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            elb = self._get_client('elbv2', region)
            response = elb.describe_load_balancers()
            for lb in response.get('LoadBalancers', []):
                name = lb.get('LoadBalancerName')
                arn = lb.get('LoadBalancerArn')
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::ElasticLoadBalancingV2::LoadBalancer",
                    resource_name=name, arn=arn, status=lb.get('State', {}).get('Code', 'unknown'), created_at=lb.get('CreatedTime'),
                    metadata={"dns_name": lb.get('DNSName'), "type": lb.get('Type')}
                ))
            
            tg_resp = elb.describe_target_groups()
            for tg in tg_resp.get('TargetGroups', []):
                name = tg.get('TargetGroupName')
                arn = tg.get('TargetGroupArn')
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::ElasticLoadBalancingV2::TargetGroup",
                    resource_name=name, arn=arn, status="available",
                    metadata={"target_type": tg.get('TargetType'), "port": tg.get('Port')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan ELB in {region}: {e}")
            warnings.append(self._format_warning("elbv2", e))
        return resources, warnings

    def _scan_alarms(self, region: str) -> tuple[List[Dict], List[Dict]]:
        resources = []
        warnings = []
        try:
            cw = self._get_client('cloudwatch', region)
            response = cw.describe_alarms()
            for alarm in response.get('MetricAlarms', []):
                name = alarm.get('AlarmName')
                arn = alarm.get('AlarmArn')
                resources.append(normalize_aws_resource(
                    account_id=self.account_id, region=region, resource_type="AWS::CloudWatch::Alarm",
                    resource_name=name, arn=arn, status=alarm.get('StateValue', 'unknown'),
                    metadata={"namespace": alarm.get('Namespace'), "metric_name": alarm.get('MetricName')}
                ))
        except Exception as e:
            logger.error(f"Failed to scan CloudWatch alarms in {region}: {e}")
            warnings.append(self._format_warning("cloudwatch", e))
        return resources, warnings

    def get_single_resource(self, resource_id: str, region: str) -> Dict:
        """
        Targeted lookup for a single resource.
        Mainly supports EC2 instances for now as requested.
        """
        try:
            # Check if it's an EC2 instance by ARN or just checking the string
            if "ec2" in resource_id.lower() and "instance/" in resource_id.lower():
                instance_id = resource_id.split("instance/")[-1]
                ec2 = self._get_client('ec2', region)
                resp = ec2.describe_instances(InstanceIds=[instance_id])
                for reservation in resp.get('Reservations', []):
                    for inst in reservation.get('Instances', []):
                        name = next((t['Value'] for t in inst.get('Tags', []) if t['Key'] == 'Name'), instance_id)
                        arn = resource_id
                        return normalize_aws_resource(
                            account_id=self.account_id, region=region, resource_type="AWS::EC2::Instance",
                            resource_name=name, arn=arn, status=inst.get('State', {}).get('Name', 'unknown'),
                            created_at=inst.get('LaunchTime'),
                            metadata={
                                "instance_type": inst.get('InstanceType'),
                                "vpc_id": inst.get('VpcId'),
                                "subnet_id": inst.get('SubnetId'),
                                "private_ip": inst.get('PrivateIpAddress'),
                                "public_ip": inst.get('PublicIpAddress'),
                                "architecture": inst.get('Architecture')
                            }
                        )
        except Exception as e:
            logger.error(f"Failed targeted lookup for {resource_id}: {e}")
            
        return None
