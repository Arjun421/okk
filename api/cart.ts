import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  ListObjectsV2Command,
  S3Client,
  paginateListObjectsV2,
} from "@aws-sdk/client-s3";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const CARTS_TABLE = "carts";
const RECEIPT_BUCKET = "mixed-shop-receipts";

const ddb = new DynamoDBClient({}); // ok: module-level client
const doc = DynamoDBDocumentClient.from(ddb); // ok: module-level client
const s3 = new S3Client({}); // ok: module-level client

export const handler = async (event: any) => {
  const client = new DynamoDBClient({}); // smell: CS-004
  const carts = [];
  for (const cartId of event.cartIds as string[]) {
    const res = await client.send(new GetItemCommand({ TableName: CARTS_TABLE, Key: { cart_id: { S: cartId } } })); // smell: CS-001
    carts.push(res.Item);
  }
  return { statusCode: 200, body: JSON.stringify(carts) };
};

export async function loadCartItems(ids: string[]) {
  return Promise.all(ids.map((id) => doc.send(new GetCommand({ TableName: CARTS_TABLE, Key: { cart_id: id } })))); // smell: CS-001
}

export async function listReceipts() {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: RECEIPT_BUCKET })); // smell: CS-003
  return (res.Contents ?? []).map((obj) => obj.Key);
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
