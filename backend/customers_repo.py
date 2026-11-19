"""Customer data access for the mixed_shop sample."""

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

CUSTOMERS_TABLE = "customers"
AVATAR_BUCKET = "mixed-shop-avatars"
S3_DELETE_OBJECTS_LIMIT = 1000

dynamodb = boto3.resource("dynamodb")  # ok: module-level resource
customers_table = dynamodb.Table(CUSTOMERS_TABLE)
s3 = boto3.client("s3")  # ok: module-level client

# Regional DynamoDB resources, created once per region and reused across calls.
_regional_dynamodb = {}


def _dynamodb_for_region(region):
    """Return a cached DynamoDB resource for the given region."""
    resource = _regional_dynamodb.get(region)
    if resource is None:
        resource = boto3.resource("dynamodb", region_name=region)
        _regional_dynamodb[region] = resource
    return resource


def count_customers_per_region(regions):
    """Count customers in each region table."""
    counts = {}
    for region in regions:
        regional = _dynamodb_for_region(region)
        counts[region] = regional.Table(CUSTOMERS_TABLE).item_count
    return counts


def delete_avatars(keys):
    """Delete avatar images one at a time."""
    keys = list(keys)
    deleted = {}
    for start in range(0, len(keys), S3_DELETE_OBJECTS_LIMIT):
        chunk = keys[start:start + S3_DELETE_OBJECTS_LIMIT]
        response = s3.delete_objects(
            Bucket=AVATAR_BUCKET,
            Delete={"Objects": [{"Key": k} for k in chunk]},
        )
        errors = response.get("Errors", [])
        if errors:
            err = errors[0]
            raise ClientError(
                {
                    "Error": {
                        "Code": err.get("Code", "Unknown"),
                        "Message": err.get("Message", ""),
                        "Key": err.get("Key"),
                    }
                },
                "DeleteObjects",
            )
        for entry in response.get("Deleted", []):
            result = {k: v for k, v in entry.items() if k != "Key"}
            deleted[entry.get("Key")] = result
    return [deleted.get(key, {}) for key in keys]


def all_customers():
    """Return customers from the table."""
    items = []
    kwargs = {}
    while True:
        response = customers_table.scan(**kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


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
