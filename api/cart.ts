import {
  AttributeValue,
  BatchGetItemCommand,
  BatchGetItemCommandOutput,
  DynamoDBClient,
  KeysAndAttributes,
} from "@aws-sdk/client-dynamodb";
import {
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
  paginateListObjectsV2,
} from "@aws-sdk/client-s3";
import {
  BatchGetCommand,
  BatchGetCommandOutput,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const CARTS_TABLE = "carts";
const RECEIPT_BUCKET = "mixed-shop-receipts";

const ddb = new DynamoDBClient({}); // ok: module-level client
const doc = DynamoDBDocumentClient.from(ddb); // ok: module-level client
const s3 = new S3Client({}); // ok: module-level client

export const handler = async (event: any) => {
  const cartIds = event.cartIds as string[];
  const uniqueIds = Array.from(new Set(cartIds));
  const found = new Map<string, Record<string, AttributeValue>>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    let requestItems: Record<string, KeysAndAttributes> | undefined = {
      [CARTS_TABLE]: { Keys: chunk.map((id) => ({ cart_id: { S: id } })) },
    };
    while (requestItems && Object.keys(requestItems).length > 0) {
      const res: BatchGetItemCommandOutput = await ddb.send(new BatchGetItemCommand({ RequestItems: requestItems }));
      for (const item of res.Responses?.[CARTS_TABLE] ?? []) {
        const id = item.cart_id?.S;
        if (id !== undefined) found.set(id, item);
      }
      requestItems = res.UnprocessedKeys;
    }
  }
  const carts = cartIds.map((cartId) => found.get(cartId));
  return { statusCode: 200, body: JSON.stringify(carts) };
};

export async function loadCartItems(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));
  const found = new Map<string, Record<string, any>>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    let requestItems: Record<string, any> | undefined = {
      [CARTS_TABLE]: { Keys: chunk.map((id) => ({ cart_id: id })) },
    };
    while (requestItems && Object.keys(requestItems).length > 0) {
      const res: BatchGetCommandOutput = await doc.send(new BatchGetCommand({ RequestItems: requestItems }));
      for (const item of res.Responses?.[CARTS_TABLE] ?? []) {
        const id = item.cart_id;
        if (id !== undefined) found.set(String(id), item);
      }
      requestItems = res.UnprocessedKeys as Record<string, any> | undefined;
    }
  }
  return ids.map((id) => ({ Item: found.get(id) }));
}

export async function listReceipts() {
  const keys: (string | undefined)[] = [];
  let continuationToken: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await s3.send(new ListObjectsV2Command({ Bucket: RECEIPT_BUCKET, ContinuationToken: continuationToken }));
    keys.push(...(res.Contents ?? []).map((obj) => obj.Key));
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

export async function loadCartsBatched(ids: string[]) {
  const items = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await ddb.send(new BatchGetItemCommand({ RequestItems: { [CARTS_TABLE]: { Keys: chunk.map((id) => ({ cart_id: { S: id } })) } } })); // ok: batch of 100 keys
    items.push(...(res.Responses?.[CARTS_TABLE] ?? []));
  }
  return items;
}

export async function listAllReceipts() {
  const keys: string[] = [];
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: RECEIPT_BUCKET })) { // ok: paginator reads every page
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
  }
  return keys;
}

export async function cartsForCustomer(customerId: string) {
  const items = [];
  let startKey: Record<string, any> | undefined;
  do {
    const res = await doc.send(new QueryCommand({ TableName: CARTS_TABLE, KeyConditionExpression: "customer_id = :c", ExpressionAttributeValues: { ":c": customerId }, ExclusiveStartKey: startKey })); // ok: follows LastEvaluatedKey
    items.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
  } while (startKey);
  return items;
}
