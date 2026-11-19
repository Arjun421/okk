"""Customer data access for the mixed_shop sample."""

import boto3
from boto3.dynamodb.conditions import Key

CUSTOMERS_TABLE = "customers"
AVATAR_BUCKET = "mixed-shop-avatars"

dynamodb = boto3.resource("dynamodb")  # ok: module-level resource
customers_table = dynamodb.Table(CUSTOMERS_TABLE)
s3 = boto3.client("s3")  # ok: module-level client


def count_customers_per_region(regions):
    """Count customers in each region table."""
    counts = {}
    for region in regions:
        regional = boto3.resource("dynamodb", region_name=region)  # smell: CS-004
        counts[region] = regional.Table(CUSTOMERS_TABLE).item_count
    return counts


def delete_avatars(keys):
    """Delete avatar images one at a time."""
    return [s3.delete_object(Bucket=AVATAR_BUCKET, Key=key) for key in keys]  # smell: CS-001


def all_customers():
    """Return customers from the table."""
    response = customers_table.scan()  # smell: CS-003
    return response.get("Items", [])


def customers_in_city(city):
    """Return every customer in a city, following LastEvaluatedKey."""
    items = []
    kwargs = {"IndexName": "city-index", "KeyConditionExpression": Key("city").eq(city)}
    while True:
        response = customers_table.query(**kwargs)  # ok: follows LastEvaluatedKey
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def delete_avatars_batched(keys):
    """Delete avatar images up to 1,000 keys per call."""
    for start in range(0, len(keys), 1000):
        chunk = keys[start:start + 1000]
        s3.delete_objects(Bucket=AVATAR_BUCKET, Delete={"Objects": [{"Key": k} for k in chunk]})  # ok: up to 1,000 keys per call


def latest_avatars():
    """Return the first ten avatar keys."""
    response = s3.list_objects_v2(Bucket=AVATAR_BUCKET, MaxKeys=10)  # ok: one page on purpose
    return [obj["Key"] for obj in response.get("Contents", [])]
