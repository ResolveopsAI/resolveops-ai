import os
import json
import asyncio
import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

from notification_routes import send_otp_email
from app.dispatcher import dispatch_alert_event

app = FastAPI(title="notification-service", version="2.0.0")
logger = logging.getLogger("notification-service")
logging.basicConfig(level=logging.INFO)


class AlertEventPayload(BaseModel):
    event_id: str
    source: str = "ResolveOps AI"
    service: str
    severity: str  # CRITICAL, ERROR, WARNING, INFO
    title: str
    summary: str
    timestamp: str
    incident_id: Optional[str] = None
    evidence_reference: Optional[str] = None
    deduplication_key: Optional[str] = None
    routing_tags: Optional[Dict[str, Any]] = None


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(consume_service_bus())


async def consume_service_bus():
    sb_fqdn = os.getenv("SERVICE_BUS_FQDN")
    sb_queue = os.getenv("SERVICE_BUS_QUEUE_NAME", "notification-requested")

    if not sb_fqdn:
        logger.warning("SERVICE_BUS_FQDN not set. Service Bus consumer is disabled.")
        return

    from azure.servicebus.aio import ServiceBusClient
    from azure.identity.aio import DefaultAzureCredential

    try:
        credential = DefaultAzureCredential()
        client = ServiceBusClient(sb_fqdn, credential=credential)
        receiver = client.get_queue_receiver(queue_name=sb_queue)

        logger.info(f"Started listening to Service Bus queue: {sb_queue}")

        async with client:
            async with receiver:
                while True:
                    messages = await receiver.receive_messages(max_message_count=10, max_wait_time=5)
                    for msg in messages:
                        try:
                            raw_body = b"".join(msg.body).decode("utf-8") if not isinstance(msg.body, str) else str(msg.body)
                            payload = json.loads(raw_body)

                            msg_type = payload.get("type")
                            if msg_type == "otp":
                                logger.info(f"Processing OTP request for {payload.get('email')}")
                                success = await asyncio.to_thread(
                                    send_otp_email,
                                    payload.get("email"),
                                    payload.get("full_name"),
                                    payload.get("otp_code")
                                )
                                if success:
                                    await receiver.complete_message(msg)
                                else:
                                    await receiver.abandon_message(msg)
                            elif msg_type == "alert":
                                res = await dispatch_alert_event(payload)
                                logger.info(f"Dispatched alert via ServiceBus: {res}")
                                await receiver.complete_message(msg)
                            else:
                                logger.warning(f"Unknown message type: {msg_type}. Completing to ignore.")
                                await receiver.complete_message(msg)
                        except Exception as e:
                            logger.error(f"Error processing message: {e}")
                            await receiver.abandon_message(msg)
    except Exception as e:
        logger.error(f"Service Bus consumer crashed: {e}")


@app.post("/api/v1/alerts/dispatch")
async def dispatch_alert(event: AlertEventPayload):
    """
    HTTP Dispatcher Endpoint for backend generated operational alerts.
    """
    result = await dispatch_alert_event(event.dict())
    return result


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "notification-service"}
