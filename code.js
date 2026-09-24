const SPREADSHEET_ID = "1fv1tOw0qIaJbjfNZp88aMlDIIbUP236HVEEAvrnmois";
const SHEET_NAME = "Data Record";
const BACKUP_SPREADSHEET_ID = "16NwqmU7NnjF_pzM-AO_TuXW4d1EY6oTM2XLh1vQaWmY";
const BACKUP_SHEET_NAME = "Data";
const SUPABASE_URL = "https://elymgmzexvrbxmlzoohf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hnTeB0bxmdQE5ugTBKuPCQ_DXL38Zqx";
const SUPABASE_TABLE = "Project_Entries_Detailed";
const ADMIN_EMAIL = "designmenislamabad@gmail.com";

function setAdminEmail(email) {
  const cleaned = String(email || "").trim().toLowerCase();
  if (!cleaned) throw new Error("Admin email is required.");
  PropertiesService.getScriptProperties().setProperty("ADMIN_EMAIL", cleaned);
  return cleaned;
}

function getConfiguredAdminEmail() {
  try {
    const value = PropertiesService.getScriptProperties().getProperty("ADMIN_EMAIL");
    return String(value || ADMIN_EMAIL).trim().toLowerCase();
  } catch (e) {
    return ADMIN_EMAIL;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getRoleForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === ADMIN_EMAIL) return "admin";
  return "employee";
}

function getRoleFromSession(session) {
  const email = session && session.user && session.user.email ? session.user.email : "";
  return getRoleForEmail(email);
}

function doGet(e) {
  // ?page=form  →  Index.html  (Project Entry Form)
  // ?page=records  →  Records.html  (All Projects Record)
  // ?page=dashboard  →  Dashboard.html
  // no page / ?page=login  →  Login.html
  const page = e && e.parameter ? e.parameter.page : "login";
  if (page === "login") {
    return HtmlService
      .createHtmlOutputFromFile("Login")
      .setTitle("Login - Designmen BD Portal")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const token = e && e.parameter ? e.parameter.token : "";
  const user = getAuthenticatedUser(token);
  if (!user) {
    return HtmlService
      .createHtmlOutputFromFile("Login")
      .setTitle("Login - Designmen BD Portal")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (e && e.parameter && e.parameter.page === "form") {
    if (user.role !== "admin") {
      return HtmlService
        .createHtmlOutputFromFile("Records")
        .setTitle("All Projects Record - Designmen BD Portal")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return HtmlService
      .createHtmlOutputFromFile("index")
      .setTitle("Project Entry Form - Designmen BD Portal")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (e && e.parameter && e.parameter.page === "records") {
    return HtmlService
      .createHtmlOutputFromFile("Records")
      .setTitle("All Projects Record - Designmen BD Portal")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService
    .createHtmlOutputFromFile("Dashboard")
    .setTitle("BD Dashboard - Designmen")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* SUPABASE REST / AUTHENTICATION */
function supabaseRequest(path, method, body, accessToken, prefer) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + (accessToken || SUPABASE_ANON_KEY),
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const response = UrlFetchApp.fetch(SUPABASE_URL + path, {
    method: method || "get",
    headers: headers,
    payload: body === undefined ? undefined : JSON.stringify(body),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = text; }
  if (status < 200 || status >= 300) {
    const message = parsed && (parsed.msg || parsed.message || parsed.error_description || parsed.error) || text || ("HTTP " + status);
    throw new Error("Supabase: " + message);
  }
  return parsed;
}

function authenticateWithSupabase(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }
  if (!password || String(password).trim() === "") {
    throw new Error("Password is required.");
  }

  const session = supabaseRequest("/auth/v1/token?grant_type=password", "post", {
    email: normalizedEmail,
    password: String(password || "")
  });
  if (!session || !session.access_token || !session.user) {
    throw new Error("Supabase login did not return a valid session.");
  }
  if (session.user.email_confirmed_at === null || session.user.email_confirmed_at === undefined) {
    throw new Error("Please verify your email before login.");
  }
  return session;
}

function signupUser(email, password, role) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }
  if (!password || String(password).trim() === "") {
    throw new Error("Password is required.");
  }

  const selectedRole = String(role || "").trim().toLowerCase() === "admin" ? "admin" : "employee";
  if (selectedRole === "admin") {
    if (normalizedEmail !== ADMIN_EMAIL) {
      throw new Error("Only the configured admin email can create an admin account.");
    }
  }

  const response = supabaseRequest("/auth/v1/signup", "post", {
    email: normalizedEmail,
    password: String(password || ""),
    data: {
      role: selectedRole,
      created_from: "bd_portal"
    }
  });

  if (!response || !response.user) {
    throw new Error("Signup failed. Please try again.");
  }

  return {
    userId: normalizedEmail,
    role: selectedRole,
    message: "Account created successfully. Please verify your email before login."
  };
}

function sendPasswordResetEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const response = supabaseRequest("/auth/v1/recover", "post", {
    email: normalizedEmail
  });

  if (!response) {
    throw new Error("Password reset email could not be sent.");
  }

  return {
    success: true,
    message: "Password reset email sent. Please check your inbox and follow the link to create a new password."
  };
}

function getSupabaseSession(token) {
  if (!token) return null;
  const cached = CacheService.getScriptCache().get("auth_" + token);
  if (!cached) return null;
  try { return JSON.parse(cached); } catch (e) { return null; }
}

function saveSupabaseSession(token, session) {
  const userEmail = session && session.user && session.user.email ? session.user.email : "";
  const role = getRoleFromSession(session);
  CacheService.getScriptCache().put("auth_" + token, JSON.stringify({
    userId: userEmail,
    role: role,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Date.now() + (Number(session.expires_in || 3600) * 1000)
  }), 21600);
}

function getSupabaseAccessToken(token) {
  const session = getSupabaseSession(token);
  if (!session || !session.accessToken) throw new Error("Session expired. Please login again.");
  if (session.expiresAt && Date.now() < session.expiresAt - 60000) return session.accessToken;

  if (!session.refreshToken) throw new Error("Supabase session expired. Please login again.");
  const refreshed = supabaseRequest("/auth/v1/token?grant_type=refresh_token", "post", {
    refresh_token: session.refreshToken
  });
  saveSupabaseSession(token, refreshed);
  return refreshed.access_token;
}

function getAuthenticatedUser(token) {
  const session = getSupabaseSession(token);
  if (!session || !session.userId) return null;
  try {
    getSupabaseAccessToken(token);
    return { userId: session.userId, role: session.role || getRoleForEmail(session.userId) };
  } catch (e) {
    CacheService.getScriptCache().remove("auth_" + token);
    return null;
  }
}

function authenticateUser(userId, password) {
  const session = authenticateWithSupabase(userId, password);
  const token = Utilities.getUuid();
  saveSupabaseSession(token, session);
  const finalRole = getRoleFromSession(session);
  return { token: token, userId: session.user.email, role: finalRole };
}

/* LOGIN USERS / ROLE AUTHENTICATION (legacy sheet functions retained for migration compatibility) */
function getLoginUsersSheet() {
  const spreadsheet = getSpreadsheet();
  const sheet = spreadsheet.getSheetByName("login Users");
  if (!sheet) throw new Error("Sheet 'login Users' not found.");
  return sheet;
}

function getLoginUsersCached() {
  const sheet = getLoginUsersSheet();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return { headers: [], rows: [] };

  return {
    headers: values[0].map(function(h) { return String(h).trim(); }),
    rows: values.slice(1)
  };
}

function clearLoginUsersCache() {
  CacheService.getScriptCache().remove("login_users_data");
}


function findLoginUser(userId, password) {
  const cached = getLoginUsersCached();
  const headers = cached.headers;
  const values = cached.rows;
  
  if (values.length === 0) return null;

  const roleIndex = headers.indexOf("User Role") !== -1 ? headers.indexOf("User Role") : headers.indexOf("Users Role");
  const idIndex = headers.indexOf("User ID");
  const passwordIndex = headers.indexOf("User Password");
  if (roleIndex === -1 || idIndex === -1 || passwordIndex === -1) {
    throw new Error("login Users sheet must contain User Role, User ID and User Password columns.");
  }

  const requestedId = String(userId || "").trim().toLowerCase();
  const requestedPassword = String(password == null ? "" : password).trim();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowId = String(row[idIndex] || "").trim().toLowerCase();
    const rowPassword = String(row[passwordIndex] || "").trim();
    if (rowId === requestedId && rowPassword === requestedPassword) {
      const role = String(row[roleIndex] || "").trim().toLowerCase();
      return { userId: requestedId, role: role === "admin" ? "admin" : "employee", password: requestedPassword };
    }
  }
  return null;
}

function requireAdmin(token) {
  const user = getAuthenticatedUser(token);
  if (!user || user.role !== "admin") throw new Error("Admin permission required.");
  return user;
}

function getSessionUser(token) {
  const user = getAuthenticatedUser(token);
  if (!user) throw new Error("Session expired. Please login again.");
  return user;
}

function logoutUser(token) {
  if (token) CacheService.getScriptCache().remove("auth_" + token);
  return true;
}

/* GET DEPLOYED WEB APP URL — called by client-side JS for navigation */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/* SPREADSHEET HELPER */
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch(e) {
      Logger.log("Error opening spreadsheet by ID, falling back to active sheet: " + e.toString());
      return SpreadsheetApp.getActiveSpreadsheet();
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/* INITIALIZE SHEET HEADERS */
function autoInitializeSheet(sheet) {
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Sr. No.",
      "Project Name",
      "Nature",
      "Sector",
      "Region",
      "Lead Form",
      "Associated / JVs",
      "Client / Employer",
      "Client Address",
      "Contact",
      "Dealing Person",
      "Advertising Date",
      "Submission Date",
      "Technical Opening Date",
      "Financial Opening Date",
      "Project Progress Status",
      "Current Status",
      "Bid security",
      "Quoted Financial Amount",
      "Financial Bid Ranking",
      "Final Status",
      "Awarded/Granted Date",
      "Participant's Detail",
      "Progress Tracking",
      "Remarks"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#1e293b")
      .setFontColor("#ffffff")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const clientIndex = existingHeaders.indexOf("Client");
    const clientEmployerIndex = existingHeaders.indexOf("Client / Employer");
    if (clientIndex !== -1 && clientEmployerIndex === -1) {
      sheet.getRange(1, clientIndex + 1).setValue("Client / Employer");
    }
    const financialStatusIndex = existingHeaders.indexOf("Financial Status");
    const currentStatusIndex = existingHeaders.indexOf("Current Status");
    if (financialStatusIndex !== -1 && currentStatusIndex === -1) {
      sheet.getRange(1, financialStatusIndex + 1).setValue("Current Status");
    }
    const awardedDateHeader = "Awarded/Granted Date";
    if (existingHeaders.indexOf(awardedDateHeader) === -1) {
      const finalStatusColumn = existingHeaders.indexOf("Final Status");
      if (finalStatusColumn !== -1) {
        sheet.insertColumnAfter(finalStatusColumn + 1);
        sheet.getRange(1, finalStatusColumn + 2).setValue(awardedDateHeader);
      } else {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(awardedDateHeader);
      }
    }
    const requiredHeaders = ["Contact", "Participant's Detail", "Final Status", "Quoted Financial Amount", "Financial Bid Ranking", "Supabase ID"];
    requiredHeaders.forEach(header => {
      if (existingHeaders.indexOf(header) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      }
    });
  }
}

/* DATE FORMATTER */
function formatDate(val) {
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = ("0" + (val.getMonth() + 1)).slice(-2);
    const day = ("0" + val.getDate()).slice(-2);
    return year + "-" + month + "-" + day;
  }
  return val ? String(val).trim() : "";
}

/* CONVERT HEADERS TO CAMELCASE */
function getCamelCaseKey(header) {
  switch (header) {
    case "Sr. No.": return "srNo";
    case "Sr. No": return "srNo";
    case "Project Name": return "projectName";
    case "Nature": return "nature";
    case "Sector": return "sector";
    case "Region": return "region";
    case "Lead Form": return "leadForm";
    case "JV": return "jv";
    case "Associated / JVs": return "jv";
    case "Client": return "client";
    case "Client / Employer": return "client";
    case "Contact Person": return "clientAddress";
    case "Contect Person (Client)": return "clientAddress";
    case "Client Address": return "clientAddress";
    case "Contact": return "contact";
    case "Dealing Person": return "dealingAddress";
    case "Dealing Person (Bidder)": return "dealingAddress";
    case "Dealing Address": return "dealingAddress";
    case "Advertising Date": return "advertisingDate";
    case "Submission Date": return "submissionDate";
    case "Technical Opening": return "technicalOpening";
    case "Technical Opening Date": return "technicalOpening";
    case "Financial Opening": return "financialOpening";
    case "Financial Opening Date": return "financialOpening";
    case "Technical Status": return "progressStatus";
    case "Financial Status": return "currentStatus";
    case "Project Progress Status": return "progressStatus";
    case "Current Status": return "currentStatus";
    case "Progress Status": return "progressStatus";
    case "Progress Tracking": return "progressTracking";
    case "Bid Security": return "bidSecurity";
    case "Bid security": return "bidSecurity";
    case "Remarks": return "remarks";
    case "Participant's Detail": return "participantDetail";
    case "Final Status": return "finalStatus";
    case "Awarded/Granted Date": return "awardedGrantedDate";
    case "Quoted Financial Amount": return "quotedFinancialAmount";
    case "Financial Bid Ranking": return "financialBidRanking";
    default:
      return header.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
  }
}

function getDataRecordSheet() {
  const spreadsheet = getSpreadsheet();
  if (!spreadsheet) {
    throw new Error("Could not find or open the Google Spreadsheet.");
  }

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    autoInitializeSheet(sheet);
  } else {
    autoInitializeSheet(sheet);
  }

  return sheet;
}

function getBackupDataSheet() {
  const spreadsheet = SpreadsheetApp.openById(BACKUP_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(BACKUP_SHEET_NAME) || spreadsheet.getSheets()[0];
  if (!sheet) sheet = spreadsheet.insertSheet(BACKUP_SHEET_NAME);
  autoInitializeSheet(sheet);
  return sheet;
}

function getFirst500RowCount() {
  try {
    const sheet = getDataRecordSheet();
    const rowCount = Math.min(Math.max(sheet.getLastRow(), 1), 500);
    const values = sheet.getRange(1, 1, rowCount, sheet.getLastColumn()).getValues();
    if (values.length <= 1) {
      return 0;
    }

    return values.slice(1).filter(function(row) {
      return row.some(function(cell) {
        return cell !== null && String(cell).trim() !== "";
      });
    }).length;
  } catch (e) {
    Logger.log("Error in getFirst500RowCount: " + e.toString());
    return 0;
  }
}

/* INTERNAL HELPER - Fetch raw records from spreadsheet */
function _fetchRecordsFromSheet() {
  try {
    const sheet = getDataRecordSheet();
    const rowCount = Math.min(Math.max(sheet.getLastRow(), 1), 500);
    const values = sheet.getRange(1, 1, rowCount, sheet.getLastColumn()).getValues();
    
    if (values.length <= 1) {
      return [];
    }

    const headers = values[0];
    const records = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const hasData = row.some(function(cell) {
        return cell !== null && String(cell).trim() !== "";
      });

      if (!hasData) {
        continue;
      }

      const record = {};
      headers.forEach((header, index) => {
        const key = getCamelCaseKey(header);
        record[key] = formatDate(row[index]);
      });
      records.push(record);
    }
    return records;
  } catch (e) {
    Logger.log("Error in _fetchRecordsFromSheet: " + e.toString());
    throw new Error("Failed to load records from spreadsheet: " + e.message);
  }
}

/* READ ALL RECORDS (With Caching) */
function getRecords(token, forceRefresh) {
  getSessionUser(token);

  if (forceRefresh) {
    const records = _fetchRecordsFromSupabase(token);
    const version = String(Date.now());
    const cacheKey = "all_records_cache_" + version;
    CacheService.getScriptCache().put("records_cache_version", version);
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(records), 1800);
    return records;
  }

  const version = CacheService.getScriptCache().get("records_cache_version") || "0";
  const cacheKey = "all_records_cache_" + version;
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const records = _fetchRecordsFromSupabase(token);
  CacheService.getScriptCache().put(cacheKey, JSON.stringify(records), 1800);
  return records;
}

function getSupabaseRecordFields() {
  return [
    "sr_no", "project_name", "nature", "sector", "region", "lead_form", "associated_jvs",
    "client_employer", "client_address", "contact", "dealing_person", "advertising_date",
    "submission_date", "technical_opening", "financial_opening", "project_progress",
    "current_status", "bid_security", "quoted_financial_amount", "financial_bid_ranking",
    "final_status", "awarded_granted_date", "participants_detail", "progress_tracking", "remarks"
  ];
}

function supabaseRecordToClient(record) {
  return {
    srNo: record.sr_no == null ? "" : String(record.sr_no),
    projectName: record.project_name || "",
    nature: record.nature || "",
    sector: record.sector || "",
    region: record.region || "",
    leadForm: record.lead_form || "",
    jv: record.associated_jvs || "",
    client: record.client_employer || "",
    clientAddress: record.client_address || "",
    contact: record.contact || "",
    dealingAddress: record.dealing_person || "",
    advertisingDate: record.advertising_date || "",
    submissionDate: record.submission_date || "",
    technicalOpening: record.technical_opening || "",
    financialOpening: record.financial_opening || "",
    progressStatus: record.project_progress || "",
    currentStatus: record.current_status || "",
    bidSecurity: record.bid_security || "",
    quotedFinancialAmount: record.quoted_financial_amount || "",
    financialBidRanking: record.financial_bid_ranking || "",
    finalStatus: record.final_status || "",
    awardedGrantedDate: record.awarded_granted_date || "",
    participantDetail: record.participants_detail || "",
    progressTracking: record.progress_tracking || "",
    remarks: record.remarks || ""
  };
}

function clientRecordToSupabase(data, srNo) {
  const record = {
    sr_no: Number(srNo),
    project_name: data.projectName || "",
    nature: data.nature || "",
    sector: data.sector || "",
    region: data.region || "",
    lead_form: data.leadForm || "",
    associated_jvs: data.jv || "",
    client_employer: data.client || "",
    client_address: data.clientAddress || "",
    contact: data.contact || "",
    dealing_person: data.dealingAddress || "",
    advertising_date: data.advertisingDate || null,
    submission_date: data.submissionDate || null,
    technical_opening: data.technicalOpening || null,
    financial_opening: data.financialOpening || null,
    project_progress: data.progressStatus || "",
    current_status: data.currentStatus || "",
    bid_security: data.bidSecurity || "",
    quoted_financial_amount: data.quotedFinancialAmount || "",
    financial_bid_ranking: data.financialBidRanking || "",
    final_status: data.finalStatus || "",
    awarded_granted_date: data.awardedGrantedDate || null,
    participants_detail: data.participantDetail || "",
    progress_tracking: data.progressTracking || "",
    remarks: data.remarks || ""
  };
  return record;
}

function _fetchRecordsFromSupabase(token) {
  const accessToken = getSupabaseAccessToken(token);
  const fields = getSupabaseRecordFields().join(",");
  let rows = supabaseRequest("/rest/v1/" + SUPABASE_TABLE + "?select=" + fields + "&order=sr_no.asc", "get", undefined, accessToken) || [];
  if (rows.length === 0) {
    const sheetRecords = _fetchRecordsFromSheet();
    if (sheetRecords.length > 0) {
      const payload = sheetRecords.map(function(record) {
        return clientRecordToSupabase(record, Number(record.srNo));
      });
      supabaseRequest("/rest/v1/" + SUPABASE_TABLE, "post", payload, accessToken, "return=minimal");
      rows = supabaseRequest("/rest/v1/" + SUPABASE_TABLE + "?select=" + fields + "&order=sr_no.asc", "get", undefined, accessToken) || [];
    }
  }
  return (rows || []).map(supabaseRecordToClient);
}

function syncRecordToSheet(record) {
  const sheet = getDataRecordSheet();
  syncRecordToSpecificSheet(sheet, record);
  syncRecordToSpecificSheet(getBackupDataSheet(), record);
}

function syncRecordToSpecificSheet(sheet, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = headers.map(function(header) {
    const key = getCamelCaseKey(header);
    if (key === "srNo") return record.srNo || "";
    if (key === "supabaseId") return record.supabaseId || "";
    return record[key] || "";
  });
  const lastRow = sheet.getLastRow();
  let rowNumber = -1;
  if (lastRow > 1) {
    const srNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < srNos.length; i++) {
      if (Number(srNos[i][0]) === Number(record.srNo)) { rowNumber = i + 2; break; }
    }
  }
  if (rowNumber === -1) sheet.appendRow(rowData);
  else sheet.getRange(rowNumber, 1, 1, rowData.length).setValues([rowData]);
}

function deleteRecordFromSheet(srNo) {
  const sheet = getDataRecordSheet();
  deleteRecordFromSpecificSheet(sheet, srNo);
  deleteRecordFromSpecificSheet(getBackupDataSheet(), srNo);
}

function deleteRecordFromSpecificSheet(sheet, srNo) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const srNos = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < srNos.length; i++) {
    if (Number(srNos[i][0]) === Number(srNo)) { sheet.deleteRow(i + 2); return; }
  }
}

function _filterRecords(records, filters) {
  filters = filters || {};
  const query = String(filters.query || "").trim().toLowerCase();
  const nature = String(filters.nature || "").trim();
  const region = String(filters.region || "").trim();
  const currentStatus = String(filters.currentStatus || "").trim();
  const finalStatus = String(filters.finalStatus || "").trim();

  return records.filter(function(record) {
    const queryMatch = !query || Object.keys(record).some(function(key) {
      return String(record[key] || "").toLowerCase().includes(query);
    });
    const recordCurrentStatus = String(record.currentStatus || record.financialStatus || "").trim();
    const recordFinalStatus = String(record.finalStatus || "").trim();
    return queryMatch &&
      (!nature || String(record.nature || "").trim() === nature) &&
      (!region || String(record.region || "").trim() === region) &&
      (!currentStatus || recordCurrentStatus === currentStatus) &&
      (!finalStatus || recordFinalStatus === finalStatus);
  });
}

/* GET PAGINATED RECORDS - Fast loading with pagination */
function getRecordsPaginated(token, page, pageSize, forceRefresh, filters) {
  getSessionUser(token);
  page = Math.max(1, Number(page) || 1);
  pageSize = Math.min(50, Math.max(10, Number(pageSize) || 20)); // Min 10, Max 50

  const records = _filterRecords(getRecords(token, forceRefresh), filters).sort(function(a, b) {
    const dateA = a.submissionDate ? new Date(a.submissionDate).getTime() : 0;
    const dateB = b.submissionDate ? new Date(b.submissionDate).getTime() : 0;
    const validDateA = isNaN(dateA) ? 0 : dateA;
    const validDateB = isNaN(dateB) ? 0 : dateB;
    return validDateB - validDateA;
  });
  const totalRecords = records.length;
  const totalPages = Math.ceil(totalRecords / pageSize);
  
  if (page > totalPages) page = Math.max(1, totalPages);
  
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const pageRecords = records.slice(startIdx, endIdx);
  
  return {
    records: pageRecords,
    currentPage: page,
    pageSize: pageSize,
    totalRecords: totalRecords,
    totalPages: totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

/* GET TOTAL RECORDS COUNT - Fast check */
function getRecordsCount(token) {
  getSessionUser(token);
  return getRecords(token).length;
}

/* CLEAR RECORDS CACHE - Call after save/delete */
function clearRecordsCache() {
  const scriptCache = CacheService.getScriptCache();
  const nextVersion = String(Date.now());
  scriptCache.put("records_cache_version", nextVersion);
  scriptCache.remove("all_records_cache");
  scriptCache.remove("all_records_cache_" + (nextVersion));
}

function clearDashboardCaches() {
  const scriptCache = CacheService.getScriptCache();
  const nextVersion = String(Date.now());
  scriptCache.put("dashboard_cache_version", nextVersion);
  scriptCache.remove("dashboard_" + (nextVersion));
}

function renumberSerials(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const allRows = sheet.getRange(2, 1, Math.max(lastRow - 1, 0), sheet.getLastColumn()).getValues();
  const activeRows = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const hasData = row.some(function(cell) {
      return cell !== null && cell !== undefined && String(cell).trim() !== "";
    });
    if (!hasData) continue;

    const normalizedRow = row.slice();
    normalizedRow[0] = activeRows.length + 1;
    activeRows.push(normalizedRow);
  }

  if (activeRows.length === 0) return;

  const totalColumns = Math.max(sheet.getLastColumn(), activeRows[0].length);
  sheet.getRange(2, 1, Math.max(activeRows.length, 0), totalColumns).clearContent();
  sheet.getRange(2, 1, activeRows.length, activeRows[0].length).setValues(activeRows);
}

/* SAVE OR UPDATE PROJECT */
function saveProject(data, token) {
  requireAdmin(token);
  try {
    const accessToken = getSupabaseAccessToken(token);
    const existingRows = supabaseRequest("/rest/v1/" + SUPABASE_TABLE + "?select=sr_no&order=sr_no.desc", "get", undefined, accessToken) || [];
    const requestedSrNo = data.srNo === undefined || data.srNo === null || data.srNo === "" ? null : Number(data.srNo);
    const existing = requestedSrNo === null ? null : existingRows.find(function(row) { return Number(row.sr_no) === requestedSrNo; });
    if (requestedSrNo !== null && !existing) {
      throw new Error("Project with Sr. No. " + requestedSrNo + " not found to update.");
    }
    const srNo = requestedSrNo === null ? (existingRows.length ? Math.max.apply(null, existingRows.map(function(row) { return Number(row.sr_no) || 0; })) + 1 : 1) : requestedSrNo;
    const payload = clientRecordToSupabase(data, srNo);
    let savedRows;
    if (existing) {
      savedRows = supabaseRequest("/rest/v1/" + SUPABASE_TABLE + "?sr_no=eq." + encodeURIComponent(requestedSrNo), "patch", payload, accessToken, "return=representation");
    } else {
      savedRows = supabaseRequest("/rest/v1/" + SUPABASE_TABLE, "post", payload, accessToken, "return=representation");
    }
    const savedRecord = supabaseRecordToClient((savedRows && savedRows[0]) || payload);
    clearRecordsCache();
    clearDashboardCaches();
    return (existing ? "Project updated successfully (Sr. No. " : "New project saved successfully (Sr. No. ") + srNo + ")";
  } catch (e) {
    Logger.log("Error in saveProject: " + e.toString());
    throw new Error("Failed to save project in Supabase: " + e.message);
  }
}

/* DELETE PROJECT */
function deleteProject(srNo, token) {
  requireAdmin(token);
  try {
    const accessToken = getSupabaseAccessToken(token);
    const deleted = supabaseRequest("/rest/v1/" + SUPABASE_TABLE + "?sr_no=eq." + encodeURIComponent(Number(srNo)), "delete", undefined, accessToken, "return=representation");
    if (!deleted || !deleted.length) throw new Error("Project with Sr. No. " + srNo + " not found.");
    clearRecordsCache();
    clearDashboardCaches();
    return "Project Sr. No. " + srNo + " deleted successfully";
  } catch (e) {
    Logger.log("Error in deleteProject: " + e.toString());
    throw new Error("Failed to delete project in Supabase: " + e.message);
  }
}

/* GET DASHBOARD METRICS AND CHARTS DATA (With Caching) */
function getDashboardData(token, startDate, endDate, sector, region, forceRefresh) {
  getSessionUser(token);

  if (forceRefresh) {
    const version = String(Date.now());
    CacheService.getScriptCache().put("dashboard_cache_version", version);
  }

  const dashboardVersion = CacheService.getScriptCache().get("dashboard_cache_version") || "0";
  const cacheKey = "dashboard_" + dashboardVersion + "_" + (startDate || "all") + "_" + (endDate || "all") + "_" + (sector || "all") + "_" + (region || "all");
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached && !forceRefresh) {
    return JSON.parse(cached);
  }
  
  try {
    let records = getRecords(token);
    const start = startDate ? new Date(startDate + "T00:00:00") : null;
    const end = endDate ? new Date(endDate + "T23:59:59") : null;
    const selectedSector = String(sector || "").trim();
    const selectedRegion = String(region || "").trim();
    if (start || end || selectedSector || selectedRegion) {
      records = records.filter(function(record) {
        const recordDate = record.submissionDate ? new Date(record.submissionDate + "T00:00:00") : null;
        const matchesStart = !start || (recordDate && !isNaN(recordDate) && recordDate >= start);
        const matchesEnd = !end || (recordDate && !isNaN(recordDate) && recordDate <= end);
        const matchesSector = !selectedSector || String(record.sector || "").trim() === selectedSector;
        const matchesRegion = !selectedRegion || String(record.region || "").trim() === selectedRegion;
        return matchesStart && matchesEnd && matchesSector && matchesRegion;
      });
    }

    if (records.length === 0) {
      const emptyResult = {
        totalProjects: 0,
        rfpCount: 0,
        eoiPqdCount: 0,
        financialCount: 0,
        technicalCount: 0,
        activeCount: 0,
        technicalStatusCounts: [],
        financialStatusCounts: [],
        sectorData: [],
        statusData: [],
        latestUpdates: []
      };
      CacheService.getScriptCache().put(cacheKey, JSON.stringify(emptyResult), 1800); // 30 min cache
      return emptyResult;
    }

    const totalProjects = records.length;
    const first500EntriesCount = Math.min(records.length, 500);

    const rfpCount = records.filter(r => {
      const nature = String(r.nature || '').trim().toLowerCase();
      return nature === "rfp" || nature === "epc";
    }).length;
    
    const eoiPqdCount = records.filter(r => {
      const nat = String(r.nature).trim();
      return nat === "EOI" || nat === "PQD" || nat === "Enlistment/Portal";
    }).length;

    const financialCount = records.filter(r => String(r.nature || '').trim().toLowerCase() === "financial").length;

    const technicalCount = records.filter(r => String(r.nature || '').trim().toLowerCase() === "qtn").length;

    const activeCount = records.filter(r => {
      const status = String(r.progressStatus || '').trim().toLowerCase();
      return status === "working";
    }).length;

    const technicalStatusCounts = {};
    const financialStatusCounts = {};
    records.forEach(function(r) {
      var tech = String(r.currentStatus || '').trim();
      if (!tech) tech = 'Pending';

      var fin = String(r.finalStatus || r.currentStatus || r.financialStatus || '').trim();
      if (!fin) fin = 'Pending';
      technicalStatusCounts[tech] = (technicalStatusCounts[tech] || 0) + 1;
      financialStatusCounts[fin] = (financialStatusCounts[fin] || 0) + 1;
    });

    const sectorCounts = {};
    const chartSectors = ["Buildings", "Infrastructure", "Energy/Hydropower", "Water Management", "Roads", "Bridges", "Others"];
    let allPakistanCount = 0;
    records.forEach(r => {
      const region = String(r.region || "").trim().toLowerCase();
      if (region === "all pakistan") {
        allPakistanCount++;
        return;
      }
      const sec = r.sector ? String(r.sector).trim() : "Others";
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    });
    
    const totalSectorRecords = records.length;
    const allPakistanPercentage = totalSectorRecords ? (allPakistanCount / totalSectorRecords) * 100 : 0;
    const allPakistanSharePerSector = allPakistanPercentage / chartSectors.length;
    const sectorData = chartSectors.map(function(sector) {
      const baseCount = sectorCounts[sector] || 0;
      const basePercentage = totalSectorRecords ? (baseCount / totalSectorRecords) * 100 : 0;
      return {
        name: sector,
        value: Number((basePercentage + allPakistanSharePerSector).toFixed(2))
      };
    });
    const roundedSectorTotal = sectorData.reduce(function(sum, item) { return sum + item.value; }, 0);
    if (sectorData.length && roundedSectorTotal !== 100) {
      sectorData[sectorData.length - 1].value = Number((sectorData[sectorData.length - 1].value + (100 - roundedSectorTotal)).toFixed(2));
    }

    const technicalQualifiedCount = records.filter(r => {
      const status = String(r.currentStatus || '').trim().toLowerCase();
      return status === "technical qualified";
    }).length;
    const financialAwardedCount = records.filter(r => {
      const status = String(r.finalStatus || '').trim().toLowerCase();
      return status === "awarded";
    }).length;
    const prequalifiedCount = records.filter(r => {
      const status = String(r.currentStatus || '').trim().toLowerCase();
      return status === "prequalified";
    }).length;
    const qtnGrantedCount = records.filter(r => {
      const finalStatus = String(r.finalStatus || '').trim().toLowerCase();
      return finalStatus === "granted";
    }).length;

    const statusData = {
      qualified: technicalQualifiedCount,
      financialQualified: financialAwardedCount,
      eoiQualified: prequalifiedCount,
      qtnGranted: qtnGrantedCount
    };

    const latestUpdates = records.slice(0, 500).reverse().map(r => ({
      project: r.projectName || "Unnamed Project",
      submissionDate: r.submissionDate || "N/A",
      financialDate: r.financialOpening || "N/A",
      progressStatus: r.progressStatus || r.technicalStatus || "Pending",
      currentStatus: r.currentStatus || r.financialStatus || "Pending"
    }));

    const result = {
      totalProjects: totalProjects,
      first500EntriesCount: first500EntriesCount,
      rfpCount: rfpCount,
      eoiPqdCount: eoiPqdCount,
      financialCount: financialCount,
      technicalCount: technicalCount,
      activeCount: activeCount,
      technicalStatusCounts: Object.keys(technicalStatusCounts).map(function(key) {
        return { status: key, count: technicalStatusCounts[key] };
      }),
      financialStatusCounts: Object.keys(financialStatusCounts).map(function(key) {
        return { status: key, count: financialStatusCounts[key] };
      }),
      sectorData: sectorData,
      statusData: statusData,
      latestUpdates: latestUpdates
    };
    
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), 1800); // 30 min cache
    return result;
  } catch (e) {
    Logger.log("Error in getDashboardData: " + e.toString());
    throw new Error("Failed to load dashboard data: " + e.message);
  }
}
