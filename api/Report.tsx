import React from "react";
import { DynamoDBClient, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({}); // ok: module-level client

const BATCH_GET_LIMIT = 100;
const MAX_UNPROCESSED_RETRIES = 5;

async function batchGetOrders(ids: string[]): Promise<void> {
  // BatchGetItem rejects duplicate keys within a request, so dedupe first.
  const uniqueIds = Array.from(new Set(ids));
  for (let i = 0; i < uniqueIds.length; i += BATCH_GET_LIMIT) {
    let keys: Record<string, AttributeValue>[] = uniqueIds
      .slice(i, i + BATCH_GET_LIMIT)
      .map((id) => ({ order_id: { S: id } }));
    let attempt = 0;
    while (keys.length > 0) {
      const out = await ddb.send(
        new BatchGetItemCommand({ RequestItems: { orders: { Keys: keys } } })
      );
      keys = out.UnprocessedKeys?.orders?.Keys ?? [];
      if (keys.length === 0) break;
      attempt += 1;
      if (attempt > MAX_UNPROCESSED_RETRIES) {
        throw new Error(`BatchGetItem left ${keys.length} unprocessed keys after ${MAX_UNPROCESSED_RETRIES} retries`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }
}

export function OrderReport({ ids }: { ids: string[] }) {
  void batchGetOrders(ids);
  return <ul>{ids.map((id) => <li key={id}>{id}</li>)}</ul>;
}
