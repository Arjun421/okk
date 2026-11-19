import boto3


def lambda_handler(event, context):
    client = boto3.client("dynamodb")
    for order_id in event["order_ids"]:
        client.get_item(TableName="orders", Key={"order_id": {"S": order_id}})
