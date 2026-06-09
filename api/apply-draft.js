const CRM_FIELD_MAP = {
  address: "UF_CRM_1743501476",
  ipName: "UF_CRM_1742459776",
  ipResponsible: "UF_CRM_1743669674",
  cityList: "UF_CRM_1707153439",
  cityText: "UF_CRM_1747301550750",
};

const IBLOCK = {
  address: 115,
};

const ADDRESS_PROPS = {
  responsible: "PROPERTY_905",
  ipName: "PROPERTY_907",
  company: "PROPERTY_951",
  companyFallback: "PROPERTY_1243",
  city: "PROPERTY_959",
};

const APP_FIELD_NAME = "UF_CRM_DEP_WIDGET";
const FIELD_TYPE_ID = "depfields";
const DRAFT_KIND = "depfields-draft";

module.exports = async function handler(request, response) {
  try {
    assertAuthorized(request);

    const requestData = await readRequestData(request);
    const dealId = requestData.dealId || requestData.id || requestData.ID || requestData.data?.FIELDS?.ID;

    if (!dealId) {
      return sendJson(response, 400, { ok: false, error: "dealId is required" });
    }

    const result = await applyDraftToDeal(String(dealId));
    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    return sendJson(response, 500, { ok: false, error: error.message });
  }
};

async function applyDraftToDeal(dealId) {
  const appFieldNames = await getAppFieldNames();
  const deal = await callBitrix("crm.deal.get", { id: dealId });
  const draftEntry = findDraftInDeal(deal, appFieldNames);

  if (!draftEntry) {
    return {
      applied: false,
      dealId,
      message: "Draft was not found in app fields.",
      appFieldNames,
    };
  }

  const fields = await buildDealFieldsFromDraft(draftEntry.draft, appFieldNames);
  const updated = await callBitrix("crm.deal.update", {
    id: dealId,
    fields,
  });

  return {
    applied: Boolean(updated),
    dealId,
    sourceField: draftEntry.fieldName,
    appFieldNames,
    fields,
  };
}

async function getAppFieldNames() {
  const fields = await callBitrix("crm.deal.userfield.list", {});
  const fieldNames = fields
    .filter((field) => field.USER_TYPE_ID === FIELD_TYPE_ID || field.FIELD_NAME === APP_FIELD_NAME)
    .map((field) => field.FIELD_NAME)
    .filter(Boolean);

  return [...new Set([APP_FIELD_NAME, ...fieldNames])];
}

function findDraftInDeal(deal, appFieldNames) {
  for (const fieldName of appFieldNames) {
    const draft = parseDraftValue(deal?.[fieldName]);
    if (draft) {
      return { fieldName, draft };
    }
  }

  return null;
}

async function buildDealFieldsFromDraft(draft, appFieldNames) {
  if (draft.fields) {
    return withClearedAppFields(pickDealFields(draft.fields), appFieldNames);
  }

  const address = await getAddressById(draft.addressId);
  const cityName = address.city || draft.cityName || "";
  const cityItem = await getCityItem(cityName);
  const fields = {
    COMPANY_ID: address.companyId || draft.companyId || "",
    [CRM_FIELD_MAP.address]: address.id,
    [CRM_FIELD_MAP.ipName]: address.ipNameId || draft.ipNameId || "",
    [CRM_FIELD_MAP.ipResponsible]: address.responsibleId || draft.responsibleId || "",
    [CRM_FIELD_MAP.cityText]: cityName,
  };

  if (cityItem) {
    fields[CRM_FIELD_MAP.cityList] = cityItem.ID;
  }

  return withClearedAppFields(fields, appFieldNames);
}

function pickDealFields(fields) {
  const allowedFields = ["COMPANY_ID", ...Object.values(CRM_FIELD_MAP)];
  return Object.fromEntries(
    allowedFields
      .filter((fieldName) => Object.prototype.hasOwnProperty.call(fields, fieldName))
      .map((fieldName) => [fieldName, fields[fieldName]]),
  );
}

function withClearedAppFields(fields, appFieldNames) {
  return {
    ...fields,
    ...Object.fromEntries(appFieldNames.map((fieldName) => [fieldName, ""])),
  };
}

async function getAddressById(addressId) {
  const items = await callBitrix("lists.element.get", {
    IBLOCK_TYPE_ID: "lists",
    IBLOCK_ID: IBLOCK.address,
    FILTER: { ID: String(addressId) },
    start: 0,
  });
  const item = items[0];

  if (!item) {
    throw new Error(`Address ${addressId} was not found.`);
  }

  return {
    id: String(item.ID),
    city: getFirstPropertyValue(item, ADDRESS_PROPS.city),
    companyId:
      getFirstPropertyValue(item, ADDRESS_PROPS.company) ||
      getFirstPropertyValue(item, ADDRESS_PROPS.companyFallback),
    ipNameId: getFirstPropertyValue(item, ADDRESS_PROPS.ipName),
    responsibleId: getFirstPropertyValue(item, ADDRESS_PROPS.responsible),
  };
}

async function getCityItem(cityName) {
  if (!cityName) {
    return null;
  }

  const fields = await callBitrix("crm.deal.fields", {});
  const normalized = normalizeText(cityName);
  return fields[CRM_FIELD_MAP.cityList]?.items?.find((item) => normalizeText(item.VALUE) === normalized) || null;
}

function parseDraftValue(value) {
  if (!value) {
    return null;
  }

  try {
    const draft = typeof value === "string" ? JSON.parse(value) : value;
    return draft?.kind === DRAFT_KIND ? draft : null;
  } catch {
    return null;
  }
}

function getFirstPropertyValue(item, propertyName) {
  const property = item?.[propertyName];

  if (!property || typeof property !== "object") {
    return property || "";
  }

  return Object.values(property)[0] || "";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function callBitrix(method, params = {}) {
  const baseUrl = process.env.BITRIX_WEBHOOK_URL;

  if (!baseUrl) {
    throw new Error("BITRIX_WEBHOOK_URL is not configured.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || `HTTP ${response.status}`);
  }

  return payload.result;
}

function assertAuthorized(request) {
  const expectedToken = process.env.DRAFT_APPLY_TOKEN;

  if (!expectedToken) {
    return;
  }

  const token =
    request.headers?.["x-draft-token"] ||
    request.headers?.["X-Draft-Token"] ||
    request.query?.token ||
    request.body?.token;

  if (token !== expectedToken) {
    throw new Error("Unauthorized.");
  }
}

function readRequestData(request) {
  return new Promise((resolve) => {
    const fromQuery = request.query || {};
    const fromBody = request.body && typeof request.body === "object" ? request.body : {};

    if (request.method !== "POST") {
      resolve(fromQuery);
      return;
    }

    if (Object.keys(fromBody).length) {
      resolve({ ...fromQuery, ...fromBody });
      return;
    }

    let body = "";
    request.on?.("data", (chunk) => {
      body += chunk;
    });
    request.on?.("end", () => {
      try {
        resolve({ ...fromQuery, ...JSON.parse(body || "{}") });
      } catch {
        resolve({ ...fromQuery, ...Object.fromEntries(new URLSearchParams(body)) });
      }
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.status(statusCode);
  response.setHeader?.("Content-Type", "application/json; charset=utf-8");
  return response.send(JSON.stringify(payload));
}
