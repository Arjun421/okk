"""Order processing Lambda for the mixed_shop sample."""

import json
import os

import boto3

ORDERS_TABLE = os.environ.get("ORDERS_TABLE", "orders")
ORDERS_QUEUE_URL = os.environ.get("ORDERS_QUEUE_URL", "")
INVOICE_BUCKET = os.environ.get("INVOICE_BUCKET", "mixed-shop-invoices")

dynamodb = boto3.resource("dynamodb")  # ok: module-level resource
orders_table = dynamodb.Table(ORDERS_TABLE)
sqs = boto3.client("sqs")  # ok: module-level client
s3 = boto3.client("s3")  # ok: module-level client


def lambda_handler(event, context):
    """Load the requested orders and queue them for fulfilment."""
    ddb = boto3.client("dynamodb")  # smell: CS-004
    orders = []
    for order_id in event.get("order_ids", []):
        response = ddb.get_item(TableName=ORDERS_TABLE, Key={"order_id": {"S": order_id}})  # smell: CS-001
        if "Item" in response:
            orders.append(response["Item"])
    for order in orders:
        sqs.send_message(QueueUrl=ORDERS_QUEUE_URL, MessageBody=json.dumps(order))  # smell: CS-001
    return {"statusCode": 200, "body": json.dumps({"queued": len(orders)})}


def list_recent_invoices(customer_id):
    """Return invoice keys for a customer."""
    response = s3.list_objects_v2(Bucket=INVOICE_BUCKET, Prefix=f"invoices/{customer_id}/")  # smell: CS-003
    return [obj["Key"] for obj in response.get("Contents", [])]


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
