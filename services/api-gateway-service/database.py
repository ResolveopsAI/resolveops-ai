import datetime
import os
import json
from pg_database import (
    User, ApiKey, Incident, Log, Deployment, ChatHistory, PredictiveRisk
)
import pg_database

def SessionLocal():
    if not pg_database.SessionLocal:
        return None
    return pg_database.SessionLocal()

class MockDynamoTable:
    def __init__(self, model):
        self.model = model

    def put_item(self, Item):
        db = SessionLocal()
        try:
            # Simple merge: will insert or update based on PK
            model_cols = {c.name for c in self.model.__table__.columns} if hasattr(self.model, '__table__') else set()
            filtered_item = {k: v for k, v in Item.items() if not model_cols or k in model_cols}
            instance = self.model(**filtered_item)
            db.merge(instance)
            db.commit()
        finally:
            db.close()

    def delete_item(self, Key):
        db = SessionLocal()
        if not db:
            return
        try:
            instance = db.query(self.model).filter_by(**Key).first()
            if instance:
                db.delete(instance)
                db.commit()
        except Exception as e:
            print("Delete Error:", e)
        finally:
            db.close()

    def get_item(self, Key):
        db = SessionLocal()
        if not db:
            return {}
        try:
            instance = db.query(self.model).filter_by(**Key).first()
            if instance:
                d = instance.__dict__.copy()
                d.pop('_sa_instance_state', None)
                return {'Item': d}
            return {}
        finally:
            db.close()

    def scan(self):
        db = SessionLocal()
        if not db:
            return {'Items': []}
        try:
            results = []
            for instance in db.query(self.model).all():
                d = instance.__dict__.copy()
                d.pop('_sa_instance_state', None)
                results.append(d)
            return {'Items': results}
        except Exception as e:
            print("Scan Error:", e)
            return {'Items': []}
        finally:
            db.close()

    def query(self, KeyConditionExpression=None, ScanIndexForward=True, Limit=None):
        db = SessionLocal()
        try:
            q = db.query(self.model)
            
            if KeyConditionExpression is not None:
                # A boto3 Equals object has ._values (the list of values) and ._name (the key).
                if hasattr(KeyConditionExpression, '_values') and hasattr(KeyConditionExpression, '_name'):
                    k = KeyConditionExpression._name
                    v = KeyConditionExpression._values[0]
                    q = q.filter(getattr(self.model, k) == v)

            if hasattr(self.model, 'timestamp'):
                if ScanIndexForward:
                    q = q.order_by(self.model.timestamp.asc())
                else:
                    q = q.order_by(self.model.timestamp.desc())
                    
            if Limit:
                q = q.limit(Limit)
                
            results = []
            for instance in q.all():
                d = instance.__dict__.copy()
                d.pop('_sa_instance_state', None)
                results.append(d)
            return {'Items': results}
        except Exception as e:
            print("Query Error:", e)
            return {'Items': []}
        finally:
            db.close()

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues, ExpressionAttributeNames=None):
        updates = {}
        if UpdateExpression.startswith("SET "):
            set_expr = UpdateExpression[4:]
            assignments = set_expr.split(",")
            for assign in assignments:
                if "=" in assign:
                    k, v = assign.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    if ExpressionAttributeNames and k in ExpressionAttributeNames:
                        k = ExpressionAttributeNames[k]
                    if v in ExpressionAttributeValues:
                        v = ExpressionAttributeValues[v]
                    updates[k] = v
                
        db = SessionLocal()
        try:
            instance = db.query(self.model).filter_by(**Key).first()
            if instance:
                for k, v in updates.items():
                    setattr(instance, k, v)
                db.commit()
        finally:
            db.close()

def init_dynamodb():
    print("DynamoDB has been removed. PostgreSQL is now used for all tables.")

def get_users_table():
    return MockDynamoTable(User)
 
def get_keys_table():
    return MockDynamoTable(ApiKey)
 
def get_incidents_table():
    return MockDynamoTable(Incident)
 
def get_logs_table():
    return MockDynamoTable(Log)
 
def get_deployments_table():
    return MockDynamoTable(Deployment)

def get_chat_history_table():
    return MockDynamoTable(ChatHistory)

def get_predictive_risks_table():
    return MockDynamoTable(PredictiveRisk)

# --- Wrapper functions ---

def store_log(tenant_id: str, timestamp: str, log_data: dict) -> bool:
    try:
        table = get_logs_table()
        table.put_item(Item={
            'tenant_id': tenant_id,
            'timestamp': timestamp,
            'provider': log_data.get('provider', 'unknown'),
            'resource_type': log_data.get('resource_type', 'unknown'),
            'service': log_data.get('service', 'unknown'),
            'level': log_data.get('level', 'INFO'),
            'message': log_data.get('message', ''),
            'latency_ms': str(log_data.get('latency_ms')) if log_data.get('latency_ms') is not None else None,
            'status_code': log_data.get('status_code'),
            'request_id': log_data.get('request_id'),
            'cluster_id': log_data.get('cluster_id'),
            'resource_id': log_data.get('resource_id')
        })
        return True
    except Exception as e:
        print(f"Log Repository write failed: {e}")
        return False

def get_logs(tenant_id: str, limit: int = 50) -> list:
    import boto3
    try:
        table = get_logs_table()
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id),
            ScanIndexForward=False,
            Limit=limit
        )
        return response.get('Items', [])
    except Exception as e:
        print(f"Log Repository read failed: {e}")
        return []

def update_reliability_score(email: str, score: float) -> bool:
    db = SessionLocal()
    try:
        instance = db.query(User).filter_by(email=email).first()
        if instance:
            clamped_score = max(0.0, min(100.0, float(score)))
            instance.reliability_score = str(clamped_score)
            db.commit()
            return True
        return False
    finally:
        db.close()

def get_reliability_score(email: str) -> float:
    db = SessionLocal()
    try:
        instance = db.query(User).filter_by(email=email).first()
        if instance:
            return float(instance.reliability_score)
        return 100.0
    finally:
        db.close()

def store_deployment(tenant_id: str, timestamp: str, deploy_data: dict) -> bool:
    try:
        table = get_deployments_table()
        table.put_item(Item={
            'tenant_id': tenant_id,
            'timestamp': timestamp,
            'commit_sha': deploy_data.get('commit_sha', 'unknown'),
            'commit_msg': deploy_data.get('commit_msg', ''),
            'author': deploy_data.get('author', ''),
            'repository': deploy_data.get('repository', ''),
            'workflow_run_id': deploy_data.get('workflow_run_id'),
            'pr_url': deploy_data.get('pr_url', '')
        })
        return True
    except Exception as e:
        print(f"Deployment storage failed: {e}")
        return False

def get_latest_deployment(tenant_id: str):
    import boto3
    try:
        table = get_deployments_table()
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id),
            ScanIndexForward=False,
            Limit=1
        )
        items = response.get('Items', [])
        return items[0] if items else None
    except Exception as e:
        print(f"Failed to retrieve latest deployment: {e}")
        return None

def store_chat_message(tenant_id: str, session_id: str, role: str, content: str, image_base64=None, execution=None) -> bool:
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    try:
        table = get_chat_history_table()
        table.put_item(Item={
            'tenant_id': tenant_id,
            'timestamp': timestamp,
            'session_id': session_id,
            'role': role,
            'content': content,
            'image_base64': image_base64,
            'execution': execution
        })
        return True
    except Exception as e:
        print(f"PostgreSQL Chat History write failed: {e}")
        return False

def get_chat_sessions(tenant_id: str) -> list:
    import boto3
    try:
        table = get_chat_history_table()
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id)
        )
        items = response.get('Items', [])
    except Exception as e:
        items = []

    sessions = {}
    meta_titles = {}

    for item in items:
        try:
            sid = item.get('session_id', 'default')
            role = item.get('role', 'user')
            content = item.get('content') or ''
            timestamp = item.get('timestamp', '')

            if role == '_meta' and item.get('title'):
                meta_titles[sid] = item.get('title')
                continue

            if sid not in sessions:
                sessions[sid] = {
                    "session_id": sid,
                    "timestamp": timestamp,
                    "title": content[:60] + "..." if role == 'user' and content else "New Chat",
                    "last_message": content[:80] if role == 'user' and content else "",
                    "message_count": 1
                }
            else:
                sessions[sid]["message_count"] += 1
                if timestamp > sessions[sid]["timestamp"]:
                    sessions[sid]["timestamp"] = timestamp
                    if role == 'user' and content:
                        sessions[sid]["last_message"] = content[:80]
                if role == 'user' and sessions[sid]["title"] == "New Chat" and content:
                    sessions[sid]["title"] = content[:60] + "..."
        except Exception as item_ex:
            pass

    for sid, title in meta_titles.items():
        if sid in sessions:
            sessions[sid]["title"] = title

    return sorted(list(sessions.values()), key=lambda x: x['timestamp'], reverse=True)

def get_chat_history(tenant_id: str, session_id: str = None, limit: int = 50) -> list:
    import boto3
    try:
        table = get_chat_history_table()
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id),
            ScanIndexForward=True,
            Limit=limit * 2
        )
        items = response.get('Items', [])
        if session_id:
            items = [i for i in items if i.get('session_id', 'default') == session_id]
        return items[-limit:]
    except Exception as e:
        return []

def delete_chat_history(tenant_id: str, session_id: str = None) -> bool:
    db = SessionLocal()
    try:
        if session_id:
            db.query(ChatHistory).filter_by(tenant_id=tenant_id, session_id=session_id).delete()
        else:
            db.query(ChatHistory).filter_by(tenant_id=tenant_id).delete()
        db.commit()
        return True
    finally:
        db.close()

def store_predictive_risk(tenant_id: str, risk_data: dict) -> bool:
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    try:
        table = get_predictive_risks_table()
        table.put_item(Item={
            'tenant_id': tenant_id,
            'timestamp': timestamp,
            'provider': risk_data.get('provider'),
            'resource_type': risk_data.get('resource_type'),
            'resource_name': risk_data.get('resource_name'),
            'risk_score': risk_data.get('risk_score'),
            'confidence_score': risk_data.get('confidence_score'),
            'ettf_minutes': risk_data.get('ettf_minutes'),
            'analysis': risk_data.get('analysis'),
            'recommendation': risk_data.get('recommendation')
        })
        return True
    except Exception as e:
        return False

def get_predictive_risks(tenant_id: str, limit: int = 50) -> list:
    import boto3
    try:
        table = get_predictive_risks_table()
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(tenant_id),
            ScanIndexForward=False,
            Limit=limit
        )
        return response.get('Items', [])
    except Exception as e:
        return []

def update_user_integrations(email: str, integrations: dict) -> bool:
    db = SessionLocal()
    if not db: return False
    try:
        instance = db.query(User).filter_by(email=email).first()
        if instance:
            instance.integrations = integrations
            db.commit()
            return True
        return False
    finally:
        db.close()

def get_user_integrations(email: str) -> dict:
    db = SessionLocal()
    if not db: return {}
    try:
        instance = db.query(User).filter_by(email=email).first()
        if instance and instance.integrations:
            return instance.integrations
        return {}
    finally:
        db.close()

def clear_tenant_data(tenant_id: str) -> bool:
    db = SessionLocal()
    if not db: return False
    try:
        from pg_database import Incident, Log, Deployment, ChatHistory, PredictiveRisk
        db.query(Incident).filter_by(tenant_id=tenant_id).delete()
        db.query(Log).filter_by(tenant_id=tenant_id).delete()
        db.query(Deployment).filter_by(tenant_id=tenant_id).delete()
        db.query(ChatHistory).filter_by(tenant_id=tenant_id).delete()
        db.query(PredictiveRisk).filter_by(tenant_id=tenant_id).delete()
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Failed to clear tenant data: {e}")
        return False
    finally:
        db.close()
