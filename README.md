# mixed_shop

A small mixed Python / TypeScript shop (orders, customers, carts, invoices) used to
test `cloudsmell scan`. Each wasteful line carries a same-line `smell: CS-xxx` marker;
each correct pattern carries an `ok: <reason>` marker.

```bash
cloudsmell scan examples/mixed_shop --format text
```

## Rules

| ID | Meaning |
|----|---------|
| CS-001 | Cloud SDK call made once per item inside a loop when a batch API exists |
| CS-003 | List/query/scan call that reads only the first page |
| CS-004 | New SDK client created inside a handler function or a loop |

## Expected findings

| File | Line | Rule | Description |
|------|------|------|-------------|
| backend/orders_handler.py | 20 | CS-004 | `boto3.client("dynamodb")` created inside `lambda_handler` |
| backend/orders_handler.py | 23 | CS-001 | DynamoDB `get_item` inside a for-loop over order IDs |
| backend/orders_handler.py | 27 | CS-001 | SQS `send_message` inside a for-loop over orders |
| backend/orders_handler.py | 33 | CS-003 | S3 `list_objects_v2` reads only the first page |
| backend/customers_repo.py | 18 | CS-004 | `boto3.resource("dynamodb")` created inside a for-loop |
| backend/customers_repo.py | 25 | CS-001 | S3 `delete_object` inside a list comprehension |
| backend/customers_repo.py | 30 | CS-003 | `table.scan()` reads only the first page |
| api/cart.ts | 25 | CS-004 | `new DynamoDBClient({})` inside `handler` |
| api/cart.ts | 28 | CS-001 | `GetItemCommand` inside a for...of loop |
| api/cart.ts | 35 | CS-001 | `GetCommand` inside an `ids.map()` callback |
| api/cart.ts | 39 | CS-003 | `ListObjectsV2Command` with no ContinuationToken or paginator |
| api/invoices.ts | 9 | CS-004 | `BlobServiceClient.fromConnectionString` inside `saveInvoices` |
| api/invoices.ts | 14 | CS-001 | Blob `upload` inside a for...of loop |
| api/invoices.ts | 23 | CS-001 | Cosmos `item(id, id).read()` inside a for...of loop |
| api/invoices.ts | 30 | CS-003 | Cosmos `fetchNext()` called once with no continuation handling |
| api/Report.tsx | 7 | CS-001 | `GetItemCommand` inside an `ids.forEach()` callback |

## Totals

| File | Expected findings |
|------|-------------------|
| backend/orders_handler.py | 4 (CS-001 ×2, CS-003 ×1, CS-004 ×1) |
| backend/customers_repo.py | 3 (CS-001 ×1, CS-003 ×1, CS-004 ×1) |
| api/cart.ts | 4 (CS-001 ×2, CS-003 ×1, CS-004 ×1) |
| api/invoices.ts | 4 (CS-001 ×2, CS-003 ×1, CS-004 ×1) |
| api/Report.tsx | 1 (CS-001 ×1) |
| backend/utils.py | 0 |
| api/legacy.js | 0 |
| node_modules/fake-lib/index.ts | 0 |
| .venv/lib/helper.py | 0 |
| **Total** | **16** (CS-001 ×8, CS-003 ×4, CS-004 ×4) |

Files 6–9 must produce zero findings:

- `backend/utils.py` has no cloud SDK code.
- `api/legacy.js` is plain JavaScript, and the analyzer scans only TypeScript.
- `node_modules/fake-lib/index.ts` is in a dependency folder, which is skipped.
- `.venv/lib/helper.py` is in a virtualenv folder, which is skipped.

The JSX `ids.map()` in `api/Report.tsx` line 8 has no cloud call and must not be reported.
Every `ok:` line must not be reported.
