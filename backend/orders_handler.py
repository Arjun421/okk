"""Order processing Lambda for the mixed_shop sample."""

import json
import os
import time

import boto3

ORDERS_TABLE = os.environ.get("ORDERS_TABLE", "orders")
ORDERS_QUEUE_URL = os.environ.get("ORDERS_QUEUE_URL", "")
INVOICE_BUCKET = os.environ.get("INVOICE_BUCKET", "mixed-shop-invoices")

dynamodb = boto3.resource("dynamodb")  # ok: module-level resource
orders_table = dynamodb.Table(ORDERS_TABLE)
sqs = boto3.client("sqs")  # ok: module-level client
s3 = boto3.client("s3")  # ok: module-level client
ddb = boto3.client("dynamodb")  # module-level client, reused across warm invocations

_BATCH_GET_LIMIT = 100
_SQS_BATCH_LIMIT = 10
_MAX_RETRIES = 5


def _batch_get_orders(order_ids):
    """Fetch orders by id with BatchGetItem, returning a dict of order_id -> item."""
    found = {}
    unique_ids = list(dict.fromkeys(order_ids))
    for start in range(0, len(unique_ids), _BATCH_GET_LIMIT):
        chunk = unique_ids[start:start + _BATCH_GET_LIMIT]
        request_items = {ORDERS_TABLE: {"Keys": [{"order_id": {"S": order_id}} for order_id in chunk]}}
        attempt = 0
        while request_items:
            response = ddb.batch_get_item(RequestItems=request_items)
            for item in response.get("Responses", {}).get(ORDERS_TABLE, []):
                found[item["order_id"]["S"]] = item
            request_items = response.get("UnprocessedKeys") or {}
            if request_items:
                attempt += 1
                time.sleep(min(0.05 * (2 ** attempt), 2.0))
    return found


def _send_orders_batch(orders):
    """Send orders to SQS with SendMessageBatch, retrying failed entries."""
    for start in range(0, len(orders), _SQS_BATCH_LIMIT):
        chunk = orders[start:start + _SQS_BATCH_LIMIT]
        entries = [{"Id": str(i), "MessageBody": json.dumps(order)} for i, order in enumerate(chunk)]
        attempt = 0
        while entries:
            response = sqs.send_message_batch(QueueUrl=ORDERS_QUEUE_URL, Entries=entries)
            failed = response.get("Failed", [])
            if not failed:
                break
            failed_ids = {f["Id"] for f in failed}
            attempt += 1
            if attempt >= _MAX_RETRIES or any(f.get("SenderFault") for f in failed):
                raise RuntimeError(f"Failed to send {len(failed_ids)} order message(s) to SQS: {failed}")
            entries = [e for e in entries if e["Id"] in failed_ids]
            time.sleep(min(0.05 * (2 ** attempt), 2.0))


def lambda_handler(event, context):
    """Load the requested orders and queue them for fulfilment."""
    order_ids = event.get("order_ids", [])
    found = _batch_get_orders(order_ids)
    orders = []
    for order_id in order_ids:
        if order_id in found:
            orders.append(found[order_id])
    _send_orders_batch(orders)
    return {"statusCode": 200, "body": json.dumps({"queued": len(orders)})}


def list_recent_invoices(customer_id):
    """Return invoice keys for a customer."""
    keys = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=INVOICE_BUCKET, Prefix=f"invoices/{customer_id}/"):
        keys.extend(obj["Key"] for obj in page.get("Contents", []))
    return keys


def save_orders(orders):
    """Write many orders to DynamoDB."""
    with orders_table.batch_writer() as batch:  # ok: batch_writer buffers writes
        for order in orders:
            batch.put_item(Item=order)  # ok: put_item on batch_writer is batched


def queue_orders(orders):
    """Send orders to SQS in batches of 10."""
    for start in range(0, len(orders), 10):
        chunk = orders[start:start + 10]
        entries = [{"Id": str(i), "MessageBody": json.dumps(order)} for i, order in enumerate(chunk)]
        sqs.send_message_batch(QueueUrl=ORDERS_QUEUE_URL, Entries=entries)  # ok: batch of 10


def list_all_invoices(customer_id):
    """Return every invoice key for a customer, across all pages."""
    keys = []
    paginator = s3.get_paginator("list_objects_v2")  # ok: paginator reads every page
    for page in paginator.paginate(Bucket=INVOICE_BUCKET, Prefix=f"invoices/{customer_id}/"):
        keys.extend(obj["Key"] for obj in page.get("Contents", []))
    return keys
