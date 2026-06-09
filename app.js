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
  companyFallback: "PROPERTY_1243",
  city: "PROPERTY_959",
};

const MAX_ADDRESS_ROWS = 300;
const MAX_COMPANY_ROWS = 50;
const FIELD_TYPE_ID = "depfields";
const FIELD_HEIGHT = 360;
const APP_FIELD_NAME = "UF_CRM_DEP_WIDGET";
const DRAFT_KIND = "depfields-draft";

const state = {
  mode: getMode(),
  dealId: null,
  deal: null,
  isBitrix: false,
  placementOptions: {},
  draftValue: null,
  cityItems: [],
  addresses: [],
  selectedAddress: null,
  companies: new Map(),
  filters: {
    companyId: "",
    city: "",
    addressQuery: "",
  },
  isApplyingFilters: false,
};

const elements = {
  form: document.querySelector("#dependent-fields-form"),
  buttonMode: document.querySelector("#button-mode"),
  openForm: document.querySelector("#open-form-button"),
  dealIdWrapper: document.querySelector("#deal-id-wrapper"),
  dealId: document.querySelector("#deal-id-field"),
  loadDeal: document.querySelector("#load-deal-button"),
  clientCombo: document.querySelector("#client-combobox-field"),
  clientDropdown: document.querySelector("#client-options"),
  client: document.querySelector("#client-field"),
  addressCombo: document.querySelector("#address-combobox-field"),
  addressDropdown: document.querySelector("#address-options"),
  address: document.querySelector("#address-field"),
  city: document.querySelector("#city-field"),
  ipName: document.querySelector("#ip-name-field"),
  ipResponsible: document.querySelector("#ip-responsible-field"),
  filterStatus: document.querySelector("#filter-status"),
  reset: document.querySelector("#reset-button"),
  save: document.querySelector("#save-button"),
  result: document.querySelector("#result-panel"),
  resultOutput: document.querySelector("#result-output"),
  closeResult: document.querySelector("#close-result-button"),
  status: document.querySelector("#connection-status"),
  summaryAddress: document.querySelector("#summary-address"),
  summaryCity: document.querySelector("#summary-city"),
  summaryIp: document.querySelector("#summary-ip"),
  summaryResponsible: document.querySelector("#summary-responsible"),
};

init();

async function init() {
  bindEvents();
  await initBitrixContext();
  await updateRegisteredFieldHeight();

  if (isBitrixPlacement()) {
    document.body.classList.add("bitrix-frame");
  }

  if (state.mode === "button") {
    elements.buttonMode.hidden = false;
    elements.form.hidden = true;
    if (state.dealId) {
      await loadDealSummary(state.dealId);
    }
    return;
  }

  elements.buttonMode.hidden = true;
  elements.form.hidden = false;
  await loadCityItems();
  populateCityOptions();

  if (state.dealId) {
    if (elements.dealId) {
      elements.dealId.value = state.dealId;
    }
    await loadDeal(state.dealId);
    scheduleFrameResize();
    return;
  }

  await Promise.all([searchCompanies(""), applyFilters()]);
  scheduleFrameResize();
}

function bindEvents() {
  elements.openForm?.addEventListener("click", openFullForm);
  elements.loadDeal?.addEventListener("click", () => loadDeal(elements.dealId.value.trim()));
  elements.clientCombo?.addEventListener("input", debounce(handleClientLookupInput, 250));
  elements.clientCombo?.addEventListener("focus", () => showLookup(elements.clientDropdown));
  elements.clientCombo?.addEventListener("click", () => showLookup(elements.clientDropdown));
  elements.clientDropdown?.addEventListener("click", handleClientOptionClick);
  elements.client?.addEventListener("change", () => {
    state.filters.companyId = elements.client.value;
    state.selectedAddress = null;
    clearDetails();
    applyFilters();
  });
  elements.city?.addEventListener("change", () => {
    state.filters.city = elements.city.value;
    state.selectedAddress = null;
    clearDetails();
    applyFilters();
  });
  elements.addressCombo?.addEventListener("input", debounce(() => {
    state.filters.addressQuery = elements.addressCombo.value.trim();
    state.selectedAddress = null;
    clearDetails();
    applyFilters();
  }, 250));
  elements.addressCombo?.addEventListener("focus", () => showLookup(elements.addressDropdown));
  elements.addressCombo?.addEventListener("click", () => showLookup(elements.addressDropdown));
  elements.addressDropdown?.addEventListener("click", handleAddressOptionClick);
  elements.address?.addEventListener("change", handleAddressChange);
  elements.reset?.addEventListener("click", resetForm);
  elements.form?.addEventListener("submit", handleSubmit);
  elements.closeResult?.addEventListener("click", () => {
    elements.result.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".lookup")) {
      hideLookups();
    }
  });
}

async function handleClientLookupInput() {
  const query = elements.clientCombo.value.trim();

  if (!query) {
    state.filters.companyId = "";
    elements.client.value = "";
    state.selectedAddress = null;
    clearDetails();
    await Promise.all([searchCompanies("", { showDropdown: true }), applyFilters()]);
    return;
  }

  if (state.filters.companyId) {
    const selectedTitle = state.companies.get(String(state.filters.companyId))?.TITLE || "";
    if (normalizeText(query) !== normalizeText(selectedTitle)) {
      state.filters.companyId = "";
      elements.client.value = "";
      state.selectedAddress = null;
      clearDetails();
      applyFilters();
    }
  }

  await searchCompanies(query, { showDropdown: true });
}

function handleClientOptionClick(event) {
  const option = event.target.closest("[data-client-id]");
  if (!option) {
    return;
  }

  const companyId = option.dataset.clientId;
  const companyTitle = option.dataset.clientTitle || option.textContent.trim();
  selectClient(companyId, companyTitle);
}

function selectClient(companyId, companyTitle = "") {
  state.filters.companyId = String(companyId || "");
  elements.client.value = state.filters.companyId;
  elements.clientCombo.value = companyTitle || state.companies.get(state.filters.companyId)?.TITLE || "";
  state.selectedAddress = null;
  clearDetails();
  hideLookup(elements.clientDropdown);
  applyFilters();
}

function handleAddressOptionClick(event) {
  const option = event.target.closest("[data-address-id]");
  if (!option) {
    return;
  }

  elements.address.value = option.dataset.addressId;
  elements.addressCombo.value = option.dataset.addressTitle || option.textContent.trim();
  hideLookup(elements.addressDropdown);
  handleAddressChange();
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
    state.placementOptions = getPlacementOptions(placementInfo);
    state.dealId = getDealIdFromPlacement(placementInfo);
    state.draftValue = parseDraftValue(state.placementOptions.VALUE);
    elements.status.textContent = state.dealId ? `Сделка #${state.dealId}` : "Bitrix24";
  } catch (error) {
    elements.status.textContent = "Ошибка Bitrix24";
    elements.status.classList.add("error");
    showResult(error.message, true);
  }
}

function getPlacementOptions(placementInfo) {
  const sdkOptions = typeof BX24.getPlacementOptions === "function" ? BX24.getPlacementOptions() : {};
  return {
    ...window.BITRIX_PLACEMENT_OPTIONS,
    ...sdkOptions,
    ...placementInfo?.options,
  };
}

function getMode() {
  return new URLSearchParams(window.location.search).get("mode") || "form";
}

function isBitrixPlacement() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("DOMAIN") ||
    params.has("PLACEMENT") ||
    params.has("APP_SID") ||
    Boolean(window.BITRIX_REQUEST_DATA?.DOMAIN) ||
    Boolean(window.BITRIX_REQUEST_DATA?.AUTH_ID) ||
    Boolean(window.BITRIX_PLACEMENT_OPTIONS)
  );
}

function getDealIdFromPlacement(placementInfo) {
  const candidates = [
    placementInfo?.options?.ID,
    placementInfo?.options?.ENTITY_VALUE_ID,
    placementInfo?.options?.ENTITY_DATA?.entityId,
    window.BITRIX_PLACEMENT_OPTIONS?.ID,
    window.BITRIX_PLACEMENT_OPTIONS?.ENTITY_VALUE_ID,
    window.BITRIX_PLACEMENT_OPTIONS?.ENTITY_DATA?.entityId,
    window.BITRIX_PLACEMENT_OPTIONS?.VALUE_ID,
    getDealIdFromText(window.BITRIX_REQUEST_DATA?.REFERER),
    getDealIdFromText(document.referrer),
  ];

  return candidates.flat().find(isFilledId) || null;
}

function getDealIdFromText(value) {
  const match = String(value || "").match(/\/crm\/deal\/details\/(\d+)\//);
  return match ? match[1] : null;
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

async function updateRegisteredFieldHeight() {
  if (!state.isBitrix) {
    return;
  }

  try {
    await callBitrix("userfieldtype.update", {
      USER_TYPE_ID: FIELD_TYPE_ID,
      HANDLER: `${window.location.origin}/`,
      TITLE: "Зависимые поля",
      DESCRIPTION: "Выбор адреса объекта с зависимыми полями",
      OPTIONS: { height: FIELD_HEIGHT },
    });
  } catch {
    // The app can work even if this context cannot update the registered field type.
  }
}

async function loadDealSummary(dealId) {
  try {
    setBusy(true);
    const deal = await callBitrix("crm.deal.get", { id: dealId });
    state.deal = deal;
    await fillSummaryFromDeal(deal);
  } catch (error) {
    showResult(`Не удалось загрузить сделку: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

async function fillSummaryFromDeal(deal) {
  elements.summaryCity.textContent = deal[CRM_FIELD_MAP.cityText] || "не заполнено";

  const [address, ipName, ipResponsible] = await Promise.all([
    deal[CRM_FIELD_MAP.address] ? getListElementById(IBLOCK.address, deal[CRM_FIELD_MAP.address]) : null,
    deal[CRM_FIELD_MAP.ipName] ? getListElementById(IBLOCK.ipName, deal[CRM_FIELD_MAP.ipName]) : null,
    deal[CRM_FIELD_MAP.ipResponsible]
      ? getListElementById(IBLOCK.ipResponsible, deal[CRM_FIELD_MAP.ipResponsible])
      : null,
  ]);

  elements.summaryAddress.textContent = address?.NAME || "не заполнено";
  elements.summaryIp.textContent = ipName?.NAME || "не заполнено";
  elements.summaryResponsible.textContent = ipResponsible?.NAME || "не заполнено";
}

function openFullForm() {
  if (!state.dealId) {
    showResult("Не удалось определить ID сделки.", true);
    return;
  }

  const url = `${window.location.origin}/api/app?mode=form&dealId=${encodeURIComponent(state.dealId)}`;

  if (state.isBitrix && window.BX24?.openApplication) {
    BX24.openApplication({ url, dealId: state.dealId }, () => {
      loadDealSummary(state.dealId);
    });
    return;
  }

  window.open(url, "_blank", "width=1040,height=760");
}

async function loadDeal(dealId) {
  if (!dealId) {
    showResult("Укажите ID сделки.", true);
    return;
  }

  try {
    setBusy(true);
    setFilterStatus("Загружаем сделку");
    const deal = await callBitrix("crm.deal.get", { id: dealId });
    state.dealId = String(dealId);
    state.deal = deal;
    elements.status.textContent = `Сделка #${state.dealId}`;
    elements.dealIdWrapper?.classList.remove("visible");

    state.filters.companyId = isFilledId(deal.COMPANY_ID) ? String(deal.COMPANY_ID) : "";
    state.filters.city = getDealCityName(deal);
    state.filters.addressQuery = "";
    elements.addressCombo.value = "";

    await ensureCompanyOption(state.filters.companyId);
    setSelectValue(elements.client, state.filters.companyId);
    syncClientCombo();
    setSelectValue(elements.city, state.filters.city);

    const addressId = deal[CRM_FIELD_MAP.address] ? String(deal[CRM_FIELD_MAP.address]) : "";
    if (addressId) {
      const address = normalizeAddress(await getListElementById(IBLOCK.address, addressId));
      if (address) {
        mergeAddressFilters(address);
        await ensureCompanyOption(state.filters.companyId);
        setSelectValue(elements.client, state.filters.companyId);
        syncClientCombo();
        setSelectValue(elements.city, state.filters.city);
      }
    }

    await searchCompanies(elements.clientCombo.value.trim(), { keepCurrent: true });
    await applyFilters({ selectedAddressId: addressId, includeAddressId: addressId });
    await applyDraftIfNeeded();
  } catch (error) {
    showResult(`Не удалось загрузить сделку: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function getDealCityName(deal) {
  const cityText = deal[CRM_FIELD_MAP.cityText];
  if (cityText) {
    return cityText;
  }

  const cityItemId = deal[CRM_FIELD_MAP.cityList];
  return state.cityItems.find((item) => String(item.ID) === String(cityItemId))?.VALUE || "";
}

async function searchCompanies(query, options = {}) {
  try {
    setBusy(true);
    const companies = await callBitrix("crm.company.list", {
      order: { TITLE: "ASC" },
      filter: query ? { "%TITLE": query } : {},
      select: ["ID", "TITLE"],
      start: 0,
    });

    rememberCompanies(companies);
    setClientOptions(companies.slice(0, MAX_COMPANY_ROWS), options.keepCurrent ? state.filters.companyId : "");
    if (options.showDropdown) {
      elements.clientCombo.value = query;
      renderClientLookupOptions(companies.slice(0, MAX_COMPANY_ROWS));
      showLookup(elements.clientDropdown);
    }
  } catch (error) {
    showResult(`Не удалось найти клиентов: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

function setClientOptions(companies, selectedId = "") {
  const unique = new Map();

  if (selectedId && state.companies.has(String(selectedId))) {
    unique.set(String(selectedId), state.companies.get(String(selectedId)));
  }

  for (const company of companies) {
    if (isFilledId(company?.ID)) {
      unique.set(String(company.ID), { ID: String(company.ID), TITLE: company.TITLE || `Компания #${company.ID}` });
    }
  }

  elements.client.replaceChildren(new Option("Любой клиент", ""));
  for (const company of unique.values()) {
    elements.client.append(new Option(company.TITLE, company.ID));
  }

  setSelectValue(elements.client, selectedId);
  syncClientCombo();
  renderClientLookupOptions([...unique.values()]);
}

function renderClientLookupOptions(companies) {
  const items = (companies || []).filter((company) => isFilledId(company?.ID));

  if (!items.length) {
    elements.clientDropdown.replaceChildren(createLookupEmpty("Клиенты не найдены"));
    return;
  }

  elements.clientDropdown.replaceChildren(
    ...items.map((company) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lookup-option";
      item.dataset.clientId = company.ID;
      item.dataset.clientTitle = company.TITLE || `Компания #${company.ID}`;
      item.innerHTML = `
        <strong>${escapeHtml(company.TITLE || `Компания #${company.ID}`)}</strong>
        <span>Компания</span>
      `;
      return item;
    }),
  );
}

function syncClientCombo() {
  if (!elements.clientCombo) {
    return;
  }

  const companyTitle =
    state.filters.companyId && state.companies.has(String(state.filters.companyId))
      ? state.companies.get(String(state.filters.companyId)).TITLE
      : "";
  elements.clientCombo.value = companyTitle;
}

function rememberCompanies(companies) {
  for (const company of companies || []) {
    if (isFilledId(company?.ID)) {
      state.companies.set(String(company.ID), {
        ID: String(company.ID),
        TITLE: company.TITLE || `Компания #${company.ID}`,
      });
    }
  }
}

async function ensureCompanyOption(companyId) {
  if (!isFilledId(companyId) || state.companies.has(String(companyId))) {
    return;
  }

  try {
    const company = await callBitrix("crm.company.get", { id: companyId });
    rememberCompanies([company]);
  } catch {
    state.companies.set(String(companyId), { ID: String(companyId), TITLE: `Компания #${companyId}` });
  }
}

async function applyFilters(options = {}) {
  if (state.isApplyingFilters) {
    return;
  }

  state.isApplyingFilters = true;
  try {
    setBusy(true);
    setFilterStatus("Подбираем адреса");
    let addresses = await loadAddressCandidates(options.includeAddressId);
    let cityContextAddresses = await loadCityContextAddresses(addresses, options.includeAddressId);
    const cityWasAdjusted = refreshCityOptionsFromAddresses(cityContextAddresses);

    if (cityWasAdjusted) {
      addresses = await loadAddressCandidates(options.includeAddressId);
      cityContextAddresses = await loadCityContextAddresses(addresses, options.includeAddressId);
      refreshCityOptionsFromAddresses(cityContextAddresses);
    }

    state.addresses = addresses;

    await hydrateCompaniesFromAddresses([...addresses, ...cityContextAddresses]);
    refreshClientOptionsFromAddresses();
    renderAddressOptions(addresses, options.selectedAddressId);

    if (options.selectedAddressId && addresses.some((address) => address.id === String(options.selectedAddressId))) {
      elements.address.value = String(options.selectedAddressId);
      await handleAddressChange({ syncFilters: false });
      return;
    }

    setFilterStatus(getFilterStatusText(addresses.length));
  } catch (error) {
    elements.address.replaceChildren(new Option("Не удалось загрузить адреса", ""));
    setFilterStatus("Ошибка загрузки адресов");
    showResult(`Не удалось загрузить адреса: ${error.message}`, true);
  } finally {
    state.isApplyingFilters = false;
    setBusy(false);
    scheduleFrameResize();
  }
}

async function loadAddressCandidates(includeAddressId = "") {
  const filter = {};

  if (state.filters.companyId) {
    filter[ADDRESS_PROPS.company] = state.filters.companyId;
  }

  if (state.filters.city) {
    filter[ADDRESS_PROPS.city] = state.filters.city;
  }

  let rows = await getAddressRows(filter);

  if (state.filters.city && rows.length === 0) {
    const fallbackFilter = { ...filter };
    delete fallbackFilter[ADDRESS_PROPS.city];
    rows = await getAddressRows(fallbackFilter);
  }

  const normalizedQuery = normalizeText(state.filters.addressQuery);
  const normalizedCity = normalizeText(state.filters.city);

  const addresses = rows
    .map(normalizeAddress)
    .filter(Boolean)
    .filter((address) => {
      const matchesCity = !normalizedCity || normalizeText(address.city) === normalizedCity;
      const matchesCompany = !state.filters.companyId || address.companyId === String(state.filters.companyId);
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(`${address.name} ${address.cleanAddress}`).includes(normalizedQuery);

      return matchesCity && matchesCompany && matchesQuery;
    });

  if (includeAddressId && !addresses.some((address) => address.id === String(includeAddressId))) {
    const includedAddress = await getAddressById(includeAddressId);
    if (includedAddress) {
      addresses.unshift(includedAddress);
    }
  }

  return addresses;
}

async function loadCityContextAddresses(filteredAddresses, includeAddressId = "") {
  if (!state.filters.companyId) {
    return filteredAddresses;
  }

  if (!state.filters.city && !state.filters.addressQuery) {
    return filteredAddresses;
  }

  const rows = await getAddressRows({ [ADDRESS_PROPS.company]: state.filters.companyId });
  const addresses = rows
    .map(normalizeAddress)
    .filter(Boolean)
    .filter((address) => address.companyId === String(state.filters.companyId));

  if (includeAddressId && !addresses.some((address) => address.id === String(includeAddressId))) {
    const includedAddress = await getAddressById(includeAddressId);
    if (includedAddress && includedAddress.companyId === String(state.filters.companyId)) {
      addresses.unshift(includedAddress);
    }
  }

  return addresses;
}

async function getAddressRows(filter) {
  return callBitrixAll(
    "lists.element.get",
    {
      IBLOCK_TYPE_ID: "lists",
      IBLOCK_ID: IBLOCK.address,
      ELEMENT_ORDER: { ID: "DESC" },
      FILTER: filter,
      start: 0,
    },
    MAX_ADDRESS_ROWS,
  );
}

async function hydrateCompaniesFromAddresses(addresses) {
  const companyIds = [...new Set(addresses.map((address) => address.companyId).filter(isFilledId))]
    .filter((companyId) => !state.companies.has(companyId))
    .slice(0, 25);

  await Promise.all(companyIds.map((companyId) => ensureCompanyOption(companyId)));
}

function refreshClientOptionsFromAddresses() {
  const currentOptions = [...elements.client.options]
    .slice(1)
    .map((option) => ({ ID: option.value, TITLE: option.textContent }));

  const addressCompanies = [...new Set(state.addresses.map((address) => address.companyId).filter(isFilledId))]
    .map((companyId) => state.companies.get(companyId) || { ID: companyId, TITLE: `Компания #${companyId}` });

  setClientOptions([...currentOptions, ...addressCompanies], state.filters.companyId);
}

function refreshCityOptionsFromAddresses(addresses) {
  const addressCities = addresses.map((address) => address.city).filter(Boolean);
  const cities = state.filters.companyId
    ? addressCities
    : [...state.cityItems.map((item) => item.VALUE).filter(Boolean), ...addressCities];
  const citySet = new Set(cities.map(normalizeText));
  let cityWasAdjusted = false;

  if (state.filters.companyId && state.filters.city && !citySet.has(normalizeText(state.filters.city))) {
    state.filters.city = "";
    cityWasAdjusted = true;
  }

  populateCityOptions(cities, state.filters.city);
  return cityWasAdjusted;
}

function populateCityOptions(extraCities = [], selectedCity = state.filters.city) {
  const cities = [...new Set(extraCities.map((city) => String(city).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  elements.city.replaceChildren(new Option("Любой город", ""));
  for (const city of cities) {
    elements.city.append(new Option(city, city));
  }

  setSelectValue(elements.city, selectedCity);
}

function renderAddressOptions(addresses, selectedAddressId = "") {
  elements.address.disabled = false;
  elements.address.replaceChildren(new Option(addresses.length ? "Выберите адрес" : "Адреса не найдены", ""));

  for (const address of addresses) {
    const companyTitle = state.companies.get(address.companyId)?.TITLE;
    const parts = [address.cleanAddress || address.name, address.city, companyTitle].filter(Boolean);
    elements.address.append(new Option(parts.join(" · "), address.id));
  }

  if (selectedAddressId) {
    setSelectValue(elements.address, selectedAddressId);
    syncAddressCombo(addresses.find((address) => address.id === String(selectedAddressId)));
  } else {
    elements.addressCombo.value = state.filters.addressQuery;
  }

  renderAddressLookupOptions(addresses);
}

function renderAddressLookupOptions(addresses) {
  if (!addresses.length) {
    elements.addressDropdown.replaceChildren(createLookupEmpty("Адреса не найдены"));
    return;
  }

  elements.addressDropdown.replaceChildren(
    ...addresses.map((address) => {
      const companyTitle = state.companies.get(address.companyId)?.TITLE || "";
      const title = address.cleanAddress || address.name || `Адрес #${address.id}`;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lookup-option";
      item.dataset.addressId = address.id;
      item.dataset.addressTitle = title;
      item.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml([address.city, companyTitle].filter(Boolean).join(" · "))}</span>
      `;
      return item;
    }),
  );
}

function syncAddressCombo(address) {
  if (!elements.addressCombo) {
    return;
  }

  elements.addressCombo.value = address ? address.cleanAddress || address.name || "" : "";
}

async function handleAddressChange(options = {}) {
  const addressId = elements.address.value;
  state.selectedAddress = null;
  clearDetails();

  if (!addressId) {
    setFilterStatus(getFilterStatusText(state.addresses.length));
    return;
  }

  try {
    setBusy(true);
    const address = await getAddressById(addressId);

    if (!address) {
      throw new Error("Адрес не найден.");
    }

    if (options.syncFilters !== false) {
      mergeAddressFilters(address);
      await ensureCompanyOption(state.filters.companyId);
      refreshClientOptionsFromAddresses();
      refreshCityOptionsFromAddresses(state.addresses);
      setSelectValue(elements.client, state.filters.companyId);
      syncClientCombo();
      setSelectValue(elements.city, state.filters.city);
    }

    const [ipName, ipResponsible] = await Promise.all([
      address.ipNameId ? getListElementById(IBLOCK.ipName, address.ipNameId) : null,
      address.responsibleId ? getListElementById(IBLOCK.ipResponsible, address.responsibleId) : null,
    ]);

    state.selectedAddress = { address, ipName, ipResponsible };
    syncAddressCombo(address);
    elements.ipName.value = ipName?.NAME || "";
    elements.ipResponsible.value = ipResponsible?.NAME || "";
    setFilterStatus("Адрес выбран, связанные поля готовы");
  } catch (error) {
    showResult(`Не удалось прочитать адрес: ${error.message}`, true);
  } finally {
    setBusy(false);
    scheduleFrameResize();
  }
}

async function getAddressById(addressId) {
  const cached = state.addresses.find((address) => address.id === String(addressId));
  if (cached) {
    return cached;
  }

  return normalizeAddress(await getListElementById(IBLOCK.address, addressId));
}

function mergeAddressFilters(address) {
  if (isFilledId(address.companyId)) {
    state.filters.companyId = String(address.companyId);
  }

  if (address.city) {
    state.filters.city = address.city;
  }
}

function normalizeAddress(item) {
  if (!item) {
    return null;
  }

  return {
    id: String(item.ID),
    name: item.NAME || "",
    cleanAddress: getFirstPropertyValue(item, ADDRESS_PROPS.cleanAddress),
    city: getFirstPropertyValue(item, ADDRESS_PROPS.city),
    companyId:
      getFirstPropertyValue(item, ADDRESS_PROPS.company) ||
      getFirstPropertyValue(item, ADDRESS_PROPS.companyFallback),
    ipNameId: getFirstPropertyValue(item, ADDRESS_PROPS.ipName),
    responsibleId: getFirstPropertyValue(item, ADDRESS_PROPS.responsible),
  };
}

async function getListElementById(iblockId, elementId) {
  const items = await callBitrix("lists.element.get", {
    IBLOCK_TYPE_ID: "lists",
    IBLOCK_ID: iblockId,
    FILTER: { ID: String(elementId) },
    start: 0,
  });

  return items[0] || null;
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

  if (!state.selectedAddress) {
    showResult("Выберите адрес объекта.", true);
    return;
  }

  if (!state.dealId) {
    await saveDraftForNewDeal();
    return;
  }

  try {
    setBusy(true);
    const result = await callBitrix("crm.deal.update", {
      id: state.dealId,
      fields: buildDealFieldsFromSelection(),
    });

    showResult(result ? "Данные успешно сохранены в сделку." : "Bitrix24 не подтвердил сохранение.", !result);
    setFilterStatus("Сохранено в сделку");
  } catch (error) {
    showResult(`Не удалось сохранить сделку: ${error.message}`, true);
  } finally {
    setBusy(false);
    scheduleFrameResize();
  }
}

async function saveDraftForNewDeal() {
  const draft = buildDraftFromSelection();

  try {
    setBusy(true);
    await setPlacementValue(JSON.stringify(draft));
    state.draftValue = draft;
    showResult("Выбор сохранен. Теперь нажмите основную кнопку «Сохранить» в карточке сделки Bitrix24. После создания сделки данные применятся автоматически.");
    setFilterStatus("Черновик сохранен");
  } catch (error) {
    showResult(`Не удалось сохранить выбор для создаваемой сделки: ${error.message}`, true);
  } finally {
    setBusy(false);
    scheduleFrameResize();
  }
}

function buildDealFieldsFromSelection() {
  const { address, ipName, ipResponsible } = state.selectedAddress;
  const cityName = address.city || state.filters.city || "";
  const cityItem = findCityItem(cityName);
  const companyId = address.companyId || state.filters.companyId || elements.client.value;
  const fields = {
    COMPANY_ID: companyId,
    [CRM_FIELD_MAP.address]: address.id,
    [CRM_FIELD_MAP.ipName]: ipName?.ID || "",
    [CRM_FIELD_MAP.ipResponsible]: ipResponsible?.ID || "",
    [CRM_FIELD_MAP.cityText]: cityName,
  };

  if (cityItem) {
    fields[CRM_FIELD_MAP.cityList] = cityItem.ID;
  }

  return fields;
}

function buildDraftFromSelection() {
  const { address, ipName, ipResponsible } = state.selectedAddress;
  return {
    kind: DRAFT_KIND,
    version: 1,
    addressId: address.id,
    companyId: address.companyId || state.filters.companyId || elements.client.value,
    cityName: address.city || state.filters.city || "",
    ipNameId: ipName?.ID || address.ipNameId || "",
    responsibleId: ipResponsible?.ID || address.responsibleId || "",
    savedAt: new Date().toISOString(),
  };
}

async function applyDraftIfNeeded() {
  if (!state.dealId || !state.draftValue?.addressId) {
    return;
  }

  const currentAddressId = state.deal?.[CRM_FIELD_MAP.address];
  if (String(currentAddressId || "") === String(state.draftValue.addressId)) {
    state.draftValue = null;
    return;
  }

  try {
    setBusy(true);
    const address = await getAddressById(state.draftValue.addressId);
    if (!address) {
      throw new Error("адрес из черновика не найден");
    }

    elements.address.value = address.id;
    state.selectedAddress = null;
    mergeAddressFilters(address);
    await ensureCompanyOption(state.filters.companyId);
    setSelectValue(elements.client, state.filters.companyId);
    syncClientCombo();
    setSelectValue(elements.city, state.filters.city);
    await handleAddressChange();

    const result = await callBitrix("crm.deal.update", {
      id: state.dealId,
      fields: buildDealFieldsFromSelection(),
    });

    if (result) {
      await clearStoredDraft();
      state.draftValue = null;
      showResult("Данные из черновика применены к созданной сделке.");
    }
  } catch (error) {
    showResult(`Сделка создана, но черновик не удалось применить автоматически: ${error.message}`, true);
  } finally {
    setBusy(false);
    scheduleFrameResize();
  }
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

async function clearStoredDraft() {
  try {
    await callBitrix("crm.deal.update", {
      id: state.dealId,
      fields: { [APP_FIELD_NAME]: "" },
    });
  } catch {
    // The real CRM fields are already saved; a stale technical value is harmless.
  }
}

function setPlacementValue(value) {
  if (!state.isBitrix || !window.BX24?.placement?.call) {
    return Promise.reject(new Error("Bitrix24 не разрешил сохранить значение поля до создания сделки."));
  }

  return new Promise((resolve, reject) => {
    BX24.placement.call("setValue", value, (response) => {
      if (response?.error?.()) {
        reject(new Error(response.error()));
        return;
      }

      resolve(response?.data?.());
    });
  });
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

function clearDetails() {
  elements.ipName.value = "";
  elements.ipResponsible.value = "";
}

function resetForm() {
  state.filters.companyId = "";
  state.filters.city = "";
  state.filters.addressQuery = "";
  state.selectedAddress = null;
  elements.clientCombo.value = "";
  elements.addressCombo.value = "";
  elements.result.hidden = true;
  clearDetails();
  setSelectValue(elements.client, "");
  setSelectValue(elements.city, "");
  hideLookups();
  applyFilters();
}

function setBusy(isBusy) {
  for (const element of [
    elements.openForm,
    elements.save,
    elements.loadDeal,
    elements.city,
  ]) {
    if (element) {
      element.disabled = isBusy;
    }
  }
}

function setFilterStatus(message) {
  if (elements.filterStatus) {
    elements.filterStatus.textContent = message;
  }
}

function createLookupEmpty(message) {
  const item = document.createElement("div");
  item.className = "lookup-empty";
  item.textContent = message;
  return item;
}

function showLookup(menu) {
  if (menu && menu.childElementCount) {
    menu.hidden = false;
    scheduleFrameResize();
  }
}

function hideLookup(menu) {
  if (menu) {
    menu.hidden = true;
    scheduleFrameResize();
  }
}

function hideLookups() {
  hideLookup(elements.clientDropdown);
  hideLookup(elements.addressDropdown);
  scheduleFrameResize();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scheduleFrameResize() {
  window.clearTimeout(scheduleFrameResize.timer);
  scheduleFrameResize.timer = window.setTimeout(resizeBitrixFrame, 80);
}

function resizeBitrixFrame() {
  if (!state.isBitrix || !window.BX24) {
    return;
  }

  if (typeof BX24.fitWindow === "function") {
    BX24.fitWindow();
    return;
  }

  if (typeof BX24.resizeWindow !== "function") {
    return;
  }

  const panelBottom = elements.form?.closest(".panel")?.getBoundingClientRect().bottom || 0;
  const dropdownBottom = [...document.querySelectorAll(".lookup-menu:not([hidden])")]
    .reduce((bottom, menu) => Math.max(bottom, menu.getBoundingClientRect().bottom), 0);
  const contentHeight = Math.ceil(Math.max(document.body.scrollHeight, panelBottom, dropdownBottom));
  const contentWidth = Math.ceil(Math.max(document.body.scrollWidth, document.documentElement.scrollWidth));
  BX24.resizeWindow(contentWidth || 620, contentHeight || 320);
}

function getFilterStatusText(count) {
  if (!count) {
    return "По текущим условиям адреса не найдены";
  }

  return `Найдено адресов: ${count}`;
}

function setSelectValue(select, value) {
  const normalizedValue = String(value || "");

  if (normalizedValue && ![...select.options].some((option) => option.value === normalizedValue)) {
    select.append(new Option(normalizedValue, normalizedValue));
  }

  select.value = normalizedValue;
}

function isFilledId(value) {
  return Boolean(value && String(value) !== "0");
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

async function callBitrix(method, params = {}) {
  const page = await callBitrixPage(method, params);
  return page.data;
}

async function callBitrixAll(method, params = {}, limit = 200) {
  if (state.isBitrix) {
    return callBitrixSdkAll(method, params, limit);
  }

  const items = [];
  let next = params.start || 0;

  while (items.length < limit && next !== undefined && next !== null) {
    const page = await callBitrixPage(method, { ...params, start: next });
    items.push(...page.data);
    next = page.next;

    if (next === undefined || next === null) {
      break;
    }
  }

  return items.slice(0, limit);
}

async function callBitrixPage(method, params = {}) {
  if (state.isBitrix) {
    return { data: await callBitrixSdk(method, params), next: null };
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

  return { data: payload.result || [], next: payload.next };
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

function callBitrixSdkAll(method, params, limit) {
  return new Promise((resolve, reject) => {
    const items = [];

    const handleResponse = (response) => {
      if (response.error()) {
        reject(new Error(response.error()));
        return;
      }

      items.push(...response.data());

      if (items.length >= limit || typeof response.more !== "function" || !response.more()) {
        resolve(items.slice(0, limit));
        return;
      }

      response.next(handleResponse);
    };

    BX24.callMethod(method, params, handleResponse);
  });
}

function showResult(payload, isError = false) {
  elements.result.hidden = false;
  elements.status.classList.toggle("error", isError);
  elements.resultOutput.textContent =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  scheduleFrameResize();
}
