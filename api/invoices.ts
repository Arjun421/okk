import { HttpRequest, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient, OperationInput } from "@azure/cosmos";

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING ?? ""); // ok: module-level client
const container = cosmos.database("shop").container("invoices");

const blobService = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING ?? "");
const containerClient = blobService.getContainerClient("invoices");

function uploadInvoice(invoice: { id: string; pdf: string }) {
  const body = invoice.pdf;
  return containerClient.getBlockBlobClient(`${invoice.id}.pdf`).upload(body, body.length);
}

export async function saveInvoices(request: HttpRequest, context: InvocationContext) {
  const invoices = (await request.json()) as { id: string; pdf: string }[];
  // Blob Storage has no batch upload API; upload concurrently instead of one round trip after another.
  await Promise.all(invoices.map(uploadInvoice));
  context.log(`saved ${invoices.length} invoices`);
  return { status: 200 };
}

export async function loadInvoices(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const operations: OperationInput[] = ids.map((id) => ({ operationType: "Read", id, partitionKey: id }));
  const responses = await container.items.bulk(operations, { continueOnError: true });
  return responses.map((response) => response.resourceBody);
}

export async function firstInvoices() {
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll();
  return resources;
}

export async function allInvoices() {
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll(); // ok: fetchAll reads every page
  return resources;
}

export async function createInvoices(invoices: { id: string; total: number }[]) {
  const operations: OperationInput[] = invoices.map((invoice) => ({ operationType: "Create", resourceBody: invoice }));
  return container.items.bulk(operations); // ok: bulk API
}
