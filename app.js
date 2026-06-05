const CRM_FIELD_MAP = {
  address: "UF_CRM_1743501476",
  ipName: "UF_CRM_1742459776",
  ipResponsible: "UF_CRM_1743669674",
  cityList: "UF_CRM_1707153439",
  cityText: "UF_CRM_1747301550750",
};

const IBLOCK = {
  ipName: 109,
  address: 115,
  ipResponsible: 117,
};

const ADDRESS_PROPS = {
  cleanAddress: "PROPERTY_839",
  responsible: "PROPERTY_905",
  ipName: "PROPERTY_907",
  company: "PROPERTY_951",
  executor: "PROPERTY_957",
  city: "PROPERTY_959",
  companyId: "PROPERTY_1243",
};

const state = {
  dealId: null,
  deal: null,
  selectedAddress: null,
  cityItems: [],
  isBitrix: false,
};

const elements = {
  form: document.querySelector("#dependent-fields-form"),
  dealIdWrapper: document.querySelector("#deal-id-wrapper"),
  dealId: document.querySelector("#deal-id-field"),
  loadDeal: document.querySelector("#load-deal-button"),
  clientSearch: document.querySelector("#client-search-field"),
  searchClient: document.querySelector("#search-client-button"),
  client: document.querySelector("#client-field"),
  address: document.querySelector("#address-field"),
  city: document.querySelector("#city-field"),
  ipName: document.querySelector("#ip-name-field"),
  ipResponsible: document.querySelector("#ip-responsible-field"),
  reset: document.querySelector("#reset-button"),
  save: document.querySelector("#save-button"),
  result: document.querySelector("#result-panel"),
  resultOutput: document.querySelector("#result-output"),
  closeResult: document.querySelector("#close-result-button"),
  status: document.querySelector("#connection-status"),
};

init();

async function init() {
  bindEvents();
  await initBitrixContext();
  await loadCityItems();

  if (state.dealId) {
    elements.dealId.value = state.dealId;
    await loadDeal(state.dealId);
    return;
  }

  elements.dealIdWrapper.classList.add("visible");
  await searchCompanies("");
}

function bindEvents() {
  elements.loadDeal.addEventListener("click", () => loadDeal(elements.dealId.value.trim()));
  elements.searchClient.addEventListener("click", () => searchCompanies(elements.clientSearch.value.trim()));
  elements.clientSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCompanies(elements.clientSearch.value.trim());
    }
  });
  elements.client.addEventListener("change", () => loadAddresses(elements.client.value));
  elements.address.addEventListener("change", handleAddressChange);
  elements.reset.addEventListener("click", resetForm);
  elements.form.addEventListener("submit", handleSubmit);
  elements.closeResult.addEventListener("click", () => {
    elements.result.hidden = true;
  });
}

async function initBitrixContext() {
  if (!isBitrixPlacement()) {
    state.isBitrix = false;
    state.dealId = new URLSearchParams(window.location.search).get("dealId");
    elements.status.textContent = "Локальный REST";
    return;
  }

  try {
    await loadBitrixSdk();
    state.isBitrix = Boolean(window.BX24 && typeof window.BX24.callMethod === "function");

    if (!state.isBitrix) {
      throw new Error("Bitrix24 SDK не инициализировался.");
    }

    await new Promise((resolve) => BX24.init(resolve));
    const placementInfo = BX24.placement.info();
    state.dealId =
      placementInfo?.options?.ID ||
      placementInfo?.options?.ENTITY_VALUE_ID ||
      placementInfo?.options?.ENTITY_DATA?.entityId ||
      null;
    elements.status.textContent = state.dealId ? `Сделка #${state.dealId}` : "Bitrix24";
  } catch (error) {
    elements.status.textContent = "Ошибка Bitrix24";
    elements.status.classList.add("error");
    showResult(error.message, true);
  }
}

function isBitrixPlacement() {
  const params = new URLSearchParams(window.location.search);
  return params.has("DOMAIN") || params.has("PLACEMENT") || params.has("APP_SID");
}

function loadBitrixSdk() {
  return new Promise((resolve, reject) => {
    if (window.BX24) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Не удалось загрузить SDK Bitrix24."));
    document.head.append(script);
  });
}

async function loadDeal(dealId) {
  if (!dealId) {
    showResult("Укажите ID сделки.", true);
    return;
  }

  try {
    setBusy(true);
    const deal = await callBitrix("crm.deal.get", { id: dealId });
    state.dealId = String(dealId);
    state.deal = deal;
    elements.status.textContent = `Сделка #${state.dealId}`;

    if (deal.COMPANY_ID && deal.COMPANY_ID !== "0") {
      const company = await callBitrix("crm.company.get", { id: deal.COMPANY_ID });
      setClientOptions([{ ID: company.ID, TITLE: company.TITLE }], company.ID);
      await loadAddresses(company.ID, deal[CRM_FIELD_MAP.address]);
    } else {
      await searchCompanies("");
      resetAddressAndDetails("У сделки не выбран клиент");
    }
  } catch (error) {
    showResult(`Не удалось загрузить сделку: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function searchCompanies(query) {
  try {
    setBusy(true);
    const companies = await callBitrix("crm.company.list", {
      order: { TITLE: "ASC" },
      filter: query ? { "%TITLE": query } : {},
      select: ["ID", "TITLE"],
      start: 0,
    });
    setClientOptions(companies.slice(0, 50));
    resetAddressAndDetails(companies.length ? "Выберите клиента" : "Клиенты не найдены");
  } catch (error) {
    showResult(`Не удалось найти клиентов: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function setClientOptions(companies, selectedId = "") {
  elements.client.replaceChildren(new Option("Выберите клиента", ""));

  for (const company of companies) {
    elements.client.append(new Option(company.TITLE, company.ID));
  }

  elements.client.value = selectedId || "";
}

async function loadAddresses(companyId, selectedAddressId = "") {
  resetAddressAndDetails("Загрузка адресов...");

  if (!companyId) {
    resetAddressAndDetails("Сначала выберите клиента");
    return;
  }

  try {
    setBusy(true);
    const response = await callBitrix("lists.element.get", {
      IBLOCK_TYPE_ID: "lists",
      IBLOCK_ID: IBLOCK.address,
      ELEMENT_ORDER: { ID: "DESC" },
      FILTER: { [ADDRESS_PROPS.company]: companyId },
      start: 0,
    });

    const addresses = response.slice(0, 100);
    elements.address.disabled = false;
    elements.address.replaceChildren(new Option(addresses.length ? "Выберите адрес" : "Адреса не найдены", ""));

    for (const address of addresses) {
      elements.address.append(new Option(address.NAME, address.ID));
    }

    if (selectedAddressId && addresses.some((address) => address.ID === String(selectedAddressId))) {
      elements.address.value = String(selectedAddressId);
      await handleAddressChange();
    }
  } catch (error) {
    resetAddressAndDetails("Ошибка загрузки адресов");
    showResult(`Не удалось загрузить адреса: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function handleAddressChange() {
  const addressId = elements.address.value;
  state.selectedAddress = null;
  elements.city.value = "";
  elements.ipName.value = "";
  elements.ipResponsible.value = "";

  if (!addressId) {
    return;
  }

  try {
    setBusy(true);
    const address = await getListElementById(IBLOCK.address, addressId);
    const ipId = getFirstPropertyValue(address, ADDRESS_PROPS.ipName) || state.deal?.[CRM_FIELD_MAP.ipName];
    const responsibleId =
      getFirstPropertyValue(address, ADDRESS_PROPS.responsible) || state.deal?.[CRM_FIELD_MAP.ipResponsible];

    const [ipName, ipResponsible] = await Promise.all([
      ipId ? getListElementById(IBLOCK.ipName, ipId) : null,
      responsibleId ? getListElementById(IBLOCK.ipResponsible, responsibleId) : null,
    ]);

    state.selectedAddress = { address, ipName, ipResponsible };
    elements.city.value = getFirstPropertyValue(address, ADDRESS_PROPS.city) || "";
    elements.ipName.value = ipName?.NAME || "";
    elements.ipResponsible.value = ipResponsible?.NAME || "";
  } catch (error) {
    showResult(`Не удалось прочитать адрес: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function getListElementById(iblockId, elementId) {
  const items = await callBitrix("lists.element.get", {
    IBLOCK_TYPE_ID: "lists",
    IBLOCK_ID: iblockId,
    FILTER: { ID: String(elementId) },
    start: 0,
  });

  if (!items.length) {
    throw new Error(`Элемент ${elementId} не найден в инфоблоке ${iblockId}.`);
  }

  return items[0];
}

async function loadCityItems() {
  try {
    const fields = await callBitrix("crm.deal.fields", {});
    state.cityItems = fields[CRM_FIELD_MAP.cityList]?.items || [];
  } catch {
    state.cityItems = [];
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.dealId) {
    showResult("Сначала загрузите сделку.", true);
    return;
  }

  if (!state.selectedAddress) {
    showResult("Выберите адрес объекта.", true);
    return;
  }

  const { address, ipName, ipResponsible } = state.selectedAddress;
  const cityName = getFirstPropertyValue(address, ADDRESS_PROPS.city) || "";
  const cityItem = findCityItem(cityName);

  const fields = {
    COMPANY_ID: elements.client.value,
    [CRM_FIELD_MAP.address]: address.ID,
    [CRM_FIELD_MAP.ipName]: ipName?.ID || "",
    [CRM_FIELD_MAP.ipResponsible]: ipResponsible?.ID || "",
    [CRM_FIELD_MAP.cityText]: cityName,
  };

  if (cityItem) {
    fields[CRM_FIELD_MAP.cityList] = cityItem.ID;
  }

  try {
    setBusy(true);
    const result = await callBitrix("crm.deal.update", {
      id: state.dealId,
      fields,
    });
    showResult({ saved: Boolean(result), dealId: state.dealId, fields });
  } catch (error) {
    showResult(`Не удалось сохранить сделку: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function findCityItem(cityName) {
  const normalized = normalizeText(cityName);
  return state.cityItems.find((item) => normalizeText(item.VALUE) === normalized);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getFirstPropertyValue(item, propertyName) {
  const property = item?.[propertyName];

  if (!property || typeof property !== "object") {
    return property || "";
  }

  return Object.values(property)[0] || "";
}

function resetAddressAndDetails(message = "Сначала выберите клиента") {
  elements.address.disabled = true;
  elements.address.replaceChildren(new Option(message, ""));
  elements.city.value = "";
  elements.ipName.value = "";
  elements.ipResponsible.value = "";
  state.selectedAddress = null;
}

function resetForm() {
  elements.form.reset();
  state.deal = null;
  state.selectedAddress = null;
  resetAddressAndDetails();
  elements.result.hidden = true;
}

function setBusy(isBusy) {
  elements.save.disabled = isBusy;
  elements.searchClient.disabled = isBusy;
  elements.loadDeal.disabled = isBusy;
}

async function callBitrix(method, params = {}) {
  if (state.isBitrix) {
    return callBitrixSdk(method, params);
  }

  const endpoint = `${window.location.origin}/rest/${method}.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error_description || payload.error || `HTTP ${response.status}`);
  }

  return payload.result || [];
}

function callBitrixSdk(method, params) {
  return new Promise((resolve, reject) => {
    BX24.callMethod(method, params, (response) => {
      if (response.error()) {
        reject(new Error(response.error()));
        return;
      }

      resolve(response.data());
    });
  });
}

function showResult(payload, isError = false) {
  elements.result.hidden = false;
  elements.status.classList.toggle("error", isError);
  elements.resultOutput.textContent =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
