/**
 * Firebase REST API helper for server-side API routes.
 * This bypasses the Firebase Admin SDK (which requires service account credentials)
 * and instead uses the Firestore REST API directly with the project API key.
 *
 * No FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL needed.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "talentumhq-33753";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper: convert Firestore REST value format to JS value
function fromFirestoreValue(value: any): any {
  if (value === undefined || value === null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return parseInt(value.integerValue, 10);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)]));
  }
  if ("arrayValue" in value) {
    return (value.arrayValue?.values || []).map(fromFirestoreValue);
  }
  return null;
}

// Helper: convert JS value to Firestore REST value format
function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, toFirestoreValue(v)])
        ),
      },
    };
  }
  return { nullValue: null };
}

// Parse a full REST document response into a plain JS object
function parseDocument(doc: any): Record<string, any> {
  if (!doc || !doc.fields) return {};
  return Object.fromEntries(
    Object.entries(doc.fields).map(([k, v]) => [k, fromFirestoreValue(v)])
  );
}

async function restFetch(path: string, method = "GET", body?: any) {
  const url = `${BASE_URL}/${path}?key=${API_KEY}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Firestore REST error ${res.status}`);
  }
  return res.json();
}

/** Get a single document */
export async function firestoreGet(
  collectionPath: string
): Promise<Record<string, any> | null> {
  try {
    const doc = await restFetch(collectionPath);
    return parseDocument(doc);
  } catch (e: any) {
    if (e.message?.includes("NOT_FOUND")) return null;
    throw e;
  }
}

/** Create/overwrite a document at a specific path */
export async function firestoreSet(
  collectionPath: string,
  data: Record<string, any>
): Promise<void> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }
  await restFetch(collectionPath, "PATCH", { fields });
}

/** Update specific fields in a document (PATCH with updateMask) */
export async function firestoreUpdate(
  docPath: string,
  data: Record<string, any>,
  authToken?: string
): Promise<void> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }
  const queryParams = Object.keys(data)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const url = `${BASE_URL}/${docPath}?key=${API_KEY}&${queryParams}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Firestore REST PATCH error ${res.status}`);
  }
}

/** Add a new document to a collection (auto-ID) */
export async function firestoreAdd(
  collectionPath: string,
  data: Record<string, any>
): Promise<string> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    // SERVER_TIMESTAMP placeholder — Firestore REST doesn't support it, use current ISO time
    if (v === "SERVER_TIMESTAMP") {
      fields[k] = toFirestoreValue(new Date().toISOString());
    } else {
      fields[k] = toFirestoreValue(v);
    }
  }
  const url = `${BASE_URL}/${collectionPath}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Firestore REST POST error ${res.status}`);
  }
  const doc = await res.json();
  // Return the auto-generated document ID
  return doc.name?.split("/").pop() || "";
}

/** Query a collection with a where filter */
export async function firestoreQuery(
  collectionPath: string,
  field: string,
  op: string,
  value: any
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const url = `${BASE_URL.replace("/documents", "")}:runQuery?key=${API_KEY}`;

  // Build parent path
  const parts = collectionPath.split("/");
  const collectionId = parts.pop()!;
  const parentPath = parts.length > 0
    ? `projects/${PROJECT_ID}/databases/(default)/documents/${parts.join("/")}`
    : `projects/${PROJECT_ID}/databases/(default)/documents`;

  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op,
          value: toFirestoreValue(value),
        },
      },
    },
  };

  const res = await fetch(`https://firestore.googleapis.com/v1/${parentPath}:runQuery?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Firestore runQuery error ${res.status}`);
  }

  const results = await res.json();
  return (results as any[])
    .filter((r: any) => r.document)
    .map((r: any) => ({
      id: r.document.name.split("/").pop() || "",
      data: parseDocument(r.document),
    }));
}
