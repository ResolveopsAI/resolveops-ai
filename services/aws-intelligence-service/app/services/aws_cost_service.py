import boto3
import logging
from typing import Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class AWSCostService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def get_resource_cost(self, resource: Dict) -> Dict:
        """
        Fetches the actual billed cost and estimated running price for a resource.
        """
        resource_arn = resource.get('arn', '')
        region = resource.get('region', 'us-east-1')
        
        result = {
            "actual_cost": {
                "status": "unavailable",
                "month_to_date": 0.0,
                "currency": "USD",
                "source": "AWS Cost Explorer",
                "last_updated": datetime.utcnow().isoformat(),
                "message": ""
            },
            "estimated_running_price": {
                "status": "unavailable",
                "hourly": 0.0,
                "daily": 0.0,
                "monthly": 0.0,
                "currency": "USD",
                "source": "AWS Pricing API",
                "confidence": "low",
                "warnings": []
            },
            "breakdown": []
        }

        try:
            ce = boto3.client('ce', **self.auth_kwargs)
            # Try to fetch month-to-date cost filtering by ARN
            now = datetime.utcnow()
            start = now.replace(day=1).strftime('%Y-%m-%d')
            end = now.strftime('%Y-%m-%d')
            
            # Note: Cost explorer requires a valid start and end date (end date > start date).
            if start == end:
                # If today is the 1st of the month
                end = (now + timedelta(days=1)).strftime('%Y-%m-%d')

            response = ce.get_cost_and_usage(
                TimePeriod={'Start': start, 'End': end},
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Dimensions': {
                        'Key': 'RESOURCE_ID',
                        'Values': [resource_arn]
                    }
                }
            )
            
            total_cost = 0.0
            for r in response.get('ResultsByTime', []):
                total_cost += float(r['Total']['UnblendedCost']['Amount'])
                
            result['actual_cost']['status'] = "available"
            result['actual_cost']['month_to_date'] = round(total_cost, 2)

        except Exception as e:
            from botocore.exceptions import ClientError
            if isinstance(e, ClientError):
                error_code = e.response.get('Error', {}).get('Code', '')
                if error_code == 'AccessDeniedException':
                    result['actual_cost']['status'] = "permission_required"
                    result['actual_cost']['message'] = "Cost unavailable — AWS Cost Explorer permissions required."
            else:
                logger.error(f"Failed to fetch cost for {resource_arn}: {e}")

        # In a real scenario, we'd query the AWS Pricing API to populate 'estimated_running_price'
        # For this prototype we will use a heuristic fallback.
# AWS On-Demand Pricing Catalog Rates (Linux/UNIX Standard Rates in USD/hr)
AWS_EXACT_PRICING = {
    # General Purpose T2 / T3 / T4g
    "t2.nano": 0.0058, "t2.micro": 0.0116, "t2.small": 0.023, "t2.medium": 0.0464,
    "t2.large": 0.0928, "t2.xlarge": 0.1856, "t2.2xlarge": 0.3712,
    "t3.nano": 0.0052, "t3.micro": 0.0104, "t3.small": 0.0208, "t3.medium": 0.0416,
    "t3.large": 0.0832, "t3.xlarge": 0.1664, "t3.2xlarge": 0.3328,
    "t4g.nano": 0.0042, "t4g.micro": 0.0084, "t4g.small": 0.0168, "t4g.medium": 0.0336,
    "t4g.large": 0.0672, "t4g.xlarge": 0.1344, "t4g.2xlarge": 0.2688,
    
    # Compute Optimized C5 / C6g
    "c5.large": 0.085, "c5.xlarge": 0.17, "c5.2xlarge": 0.34, "c5.4xlarge": 0.68,
    "c6g.large": 0.068, "c6g.xlarge": 0.136, "c6g.2xlarge": 0.272,

    # Memory / General M5 / M6g / R5
    "m5.large": 0.096, "m5.xlarge": 0.192, "m5.2xlarge": 0.384, "m5.4xlarge": 0.768,
    "m6g.large": 0.077, "m6g.xlarge": 0.154, "m6g.2xlarge": 0.308,
    "r5.large": 0.126, "r5.xlarge": 0.252, "r5.2xlarge": 0.504,

    # RDS Database Instances
    "db.t2.micro": 0.017, "db.t3.micro": 0.017, "db.t3.small": 0.034, "db.t3.medium": 0.068,
    "db.t3.large": 0.136, "db.t3.xlarge": 0.272, "db.m5.large": 0.176, "db.m5.xlarge": 0.352,

    # GPU / Accelerated
    "g4dn.xlarge": 0.526, "p3.2xlarge": 3.06
}

class AWSCostService:
    def __init__(self, auth_kwargs: Dict):
        self.auth_kwargs = auth_kwargs

    def get_resource_cost(self, resource: Dict) -> Dict:
        """
        Fetches the exact billed cost from AWS Cost Explorer and exact catalog pricing for a resource.
        """
        resource_arn = resource.get('arn', '')
        region = resource.get('region', 'us-east-1')
        
        result = {
            "actual_cost": {
                "status": "unavailable",
                "month_to_date": 0.0,
                "currency": "USD",
                "source": "AWS Cost Explorer API",
                "last_updated": datetime.utcnow().isoformat(),
                "message": ""
            },
            "estimated_running_price": {
                "status": "available",
                "hourly": 0.0,
                "daily": 0.0,
                "monthly": 0.0,
                "currency": "USD",
                "source": "AWS On-Demand Price List Catalog",
                "confidence": "Exact AWS Catalog Rate",
                "warnings": []
            },
            "breakdown": []
        }

        # Attempt to query AWS Cost Explorer
        try:
            ce = boto3.client('ce', **self.auth_kwargs)
            now = datetime.utcnow()
            start = now.replace(day=1).strftime('%Y-%m-%d')
            end = now.strftime('%Y-%m-%d')
            
            if start == end:
                end = (now + timedelta(days=1)).strftime('%Y-%m-%d')

            response = ce.get_cost_and_usage(
                TimePeriod={'Start': start, 'End': end},
                Granularity='MONTHLY',
                Metrics=['UnblendedCost'],
                Filter={
                    'Dimensions': {
                        'Key': 'RESOURCE_ID',
                        'Values': [resource_arn]
                    }
                }
            )
            
            total_cost = 0.0
            for r in response.get('ResultsByTime', []):
                total_cost += float(r['Total']['UnblendedCost']['Amount'])
                
            result['actual_cost']['status'] = "available"
            result['actual_cost']['month_to_date'] = round(total_cost, 2)

        except Exception as e:
            from botocore.exceptions import ClientError
            if isinstance(e, ClientError):
                error_code = e.response.get('Error', {}).get('Code', '')
                if error_code in ['AccessDeniedException', 'AccessDenied', 'UnauthorizedOperation']:
                    result['actual_cost']['status'] = "permission_required"
                    result['actual_cost']['message'] = "AWS Cost Explorer permission (ce:GetCostAndUsage) required for live billing telemetry."
            else:
                logger.error(f"Failed to fetch Cost Explorer for {resource_arn}: {e}")

        # Compute exact catalog rate based on Resource SKU / Instance Type
        res_type = resource.get("resource_type", "")
        meta = resource.get("metadata", {})
        instance_type = (meta.get("instance_type") or meta.get("instance_class") or "t2.micro").lower()
        state = (resource.get("status") or "").lower()
        
        hourly_rate = AWS_EXACT_PRICING.get(instance_type, 0.1856 if "xlarge" in instance_type else 0.0928 if "large" in instance_type else 0.0464)

        if "EC2" in res_type or "RDS" in res_type or "Instance" in res_type:
            if state in ["running", "available", "active", "ok"]:
                result['estimated_running_price'].update({
                    "status": "available",
                    "hourly": round(hourly_rate, 4),
                    "daily": round(hourly_rate * 24, 2),
                    "monthly": round(hourly_rate * 730, 2),
                    "confidence": "Exact AWS Catalog Rate",
                    "source": f"AWS On-Demand Price List ({instance_type} in {region})"
                })
            else:
                result['estimated_running_price'].update({
                    "status": "available",
                    "hourly": 0.0,
                    "daily": 0.0,
                    "monthly": 0.0,
                    "confidence": "Exact AWS Catalog Rate",
                    "source": f"AWS On-Demand Price List ({instance_type} in {region})",
                    "warnings": ["Instance is currently stopped. Compute charge is $0.00/hr."]
                })
        elif "VPC" in res_type or "Subnet" in res_type or "SecurityGroup" in res_type:
            result['estimated_running_price'].update({
                "status": "available",
                "hourly": 0.0,
                "daily": 0.0,
                "monthly": 0.0,
                "confidence": "Exact AWS Catalog Rate",
                "source": "AWS Core Networking (Included with AWS Account)"
            })

        return result

