const ACCOUNT_KEY = "harborDemo.credentials.v1";
const DATA_KEY = "harborDemo.activity.v1";
const STARTING_BALANCE = 5000;
const PBKDF2_ITERATIONS = 210000;

const authScreen = document.querySelector("#auth-screen");
const bankApp = document.querySelector("#bank-app");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const appMessage = document.querySelector("#app-message");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authFormTitle = document.querySelector("#auth-form-title");
const authFormDescription = document.querySelector("#auth-form-description");
const authSubmit = document.querySelector("#auth-submit");
const confirmPasswordField = document.querySelector("#confirm-password-field");

let demoData = null;
let pendingTransfer = null;
let authMode = "login";
let currentNormalizedUsername = null;

// Read local storage safely. Browsers can disable it in private or restricted modes.
function readStoredJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getCredentials(normalizedUsername) {
  const stored = readStoredJson(ACCOUNT_KEY);
  const accounts = Array.isArray(stored) ? stored : stored && typeof stored === "object" ? [stored] : [];
  return normalizedUsername
    ? accounts.find((account) => account?.normalizedUsername === normalizedUsername) || null
    : accounts;
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message visible ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function setAuthMode(mode) {
  authMode = mode;
  const isCreating = mode === "create";
  confirmPasswordField.classList.toggle("is-hidden", !isCreating);
  document.querySelector("#confirm-password").required = isCreating;
  document.querySelector("#password").autocomplete = isCreating ? "new-password" : "current-password";
  authTitle.textContent = isCreating ? "Create your Vit Bank account" : "Log in to Vit Bank";
  authDescription.textContent = isCreating
    ? "Set up an account saved in this browser."
    : "Log in or create an account.";
  authFormTitle.textContent = isCreating ? "Create account" : "Account sign in";
  authFormDescription.textContent = isCreating
    ? "Choose a username and password."
    : "";
  authFormDescription.classList.toggle("is-hidden", !isCreating);
  authSubmit.textContent = isCreating ? "Create account" : "Log in";
  const authToggle = document.querySelector("#auth-toggle");
  authToggle.textContent = isCreating ? "Back to login" : "Create account";
  authToggle.classList.remove("is-hidden");
}

// PBKDF2 derives a slow, salted password hash. The plain password is never saved.
async function hashPassword(password, saltHex) {
  if (!window.crypto || !crypto.subtle || !crypto.getRandomValues) {
    throw new Error("Secure browser cryptography is unavailable. Open Vit Bank on localhost or a secure browser connection.");
  }
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{1,2}/g), (byte) => parseInt(byte, 16))
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hash = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, salt: saltHex || Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join("") };
}

function freshDemoData() {
  return { balance: STARTING_BALANCE, beneficiaries: [], transactions: [], feedback: [] };
}

function validDemoData(data) {
  return data &&
    Number.isFinite(data.balance) &&
    Array.isArray(data.beneficiaries) &&
    Array.isArray(data.transactions) &&
    (data.feedback === undefined || Array.isArray(data.feedback));
}

function normalizeDemoData(data) {
  return {
    balance: data.balance,
    beneficiaries: data.beneficiaries,
    transactions: data.transactions,
    feedback: Array.isArray(data.feedback) ? data.feedback : []
  };
}

function readActivityStore() {
  const stored = readStoredJson(DATA_KEY);
  if (stored?.version === 2 && Array.isArray(stored.users)) {
    return {
      version: 2,
      users: stored.users
        .filter((user) => user && typeof user.normalizedUsername === "string" && validDemoData(user.activity))
        .map((user) => ({ normalizedUsername: user.normalizedUsername, activity: normalizeDemoData(user.activity) }))
    };
  }

  const users = [];
  const legacyOwner = getCredentials()[0]?.normalizedUsername;
  if (legacyOwner && validDemoData(stored)) {
    users.push({ normalizedUsername: legacyOwner, activity: normalizeDemoData(stored) });
  }
  return { version: 2, users };
}

function enterDemo(username) {
  currentNormalizedUsername = username.toLowerCase();
  const activityStore = readActivityStore();
  let userActivity = activityStore.users.find((user) => user.normalizedUsername === currentNormalizedUsername);
  if (userActivity) {
    userActivity.activity = normalizeDemoData(userActivity.activity);
    demoData = userActivity.activity;
  } else {
    demoData = freshDemoData();
    activityStore.users.push({ normalizedUsername: currentNormalizedUsername, activity: demoData });
  }
  saveStoredJson(DATA_KEY, activityStore);
  authScreen.classList.add("is-hidden");
  bankApp.classList.remove("is-hidden");
  document.querySelector("#account-name").textContent = `Account: ${username}`;
  document.querySelector("#welcome-title").textContent = `Welcome, ${username}`;
  clearMessage(authMessage);
  clearMessage(appMessage);
  showView("dashboard-view");
  renderAll();
}

function saveActivity() {
  if (!currentNormalizedUsername) {
    setMessage(appMessage, "Please sign in again before saving changes.", "error");
    return false;
  }
  const activityStore = readActivityStore();
  const userActivity = activityStore.users.find((user) => user.normalizedUsername === currentNormalizedUsername);
  if (userActivity) userActivity.activity = demoData;
  else activityStore.users.push({ normalizedUsername: currentNormalizedUsername, activity: demoData });
  if (!saveStoredJson(DATA_KEY, activityStore)) {
    setMessage(appMessage, "Could not save this change. Check whether browser storage is available.", "error");
    return false;
  }
  return true;
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    const selected = button.dataset.view === viewId;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  clearMessage(appMessage);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function makeReference() {
  const randomSuffix = crypto.getRandomValues(new Uint8Array(3))
    .reduce((text, byte) => text + byte.toString(16).padStart(2, "0"), "")
    .toUpperCase();
  return `VB-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;
}

// Escape user-entered text before placing it in the small HTML tables.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function statusClass(status) {
  return ["Pending", "Success", "Failed"].includes(status) ? status.toLowerCase() : "success";
}

function transactionTable(transactions, emptyTitle, emptyCopy) {
  if (transactions.length === 0) {
    return `<div class="empty-state"><strong>${emptyTitle}</strong>${emptyCopy}</div>`;
  }
  const rows = transactions.map((transaction) => `
    <tr>
      <td>${escapeHtml(formatDate(transaction.createdAt))}</td>
      <td>${escapeHtml(transaction.kind === "deposit" ? "Wallet addition" : transaction.beneficiaryName || "Transfer")}</td>
      <td>${transaction.kind === "deposit" ? "+" : "−"}${escapeHtml(formatMoney(transaction.amount))}</td>
      <td><span class="status ${statusClass(transaction.status)}">${escapeHtml(transaction.status)}</span></td>
      <td class="mono">${escapeHtml(transaction.reference)}</td>
    </tr>`).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Activity</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function renderBeneficiaries() {
  const target = document.querySelector("#beneficiary-list");
  const list = demoData.beneficiaries;
  if (list.length === 0) {
    target.innerHTML = '<div class="empty-state"><strong>No beneficiaries yet</strong>Add a beneficiary to make a practice transfer.</div>';
  } else {
    const rows = list.map((beneficiary) => `
      <tr>
        <td>${escapeHtml(beneficiary.name)}</td>
        <td>${escapeHtml(beneficiary.bank)}</td>
        <td>${escapeHtml(beneficiary.ifsc)}</td>
        <td class="mono">•••• ${escapeHtml(beneficiary.account.slice(-4))}</td>
      </tr>`).join("");
    target.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Bank</th><th>IFSC</th><th>Account (last 4)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  const select = document.querySelector("#transfer-beneficiary");
  const previousValue = select.value;
  select.innerHTML = '<option value="">Select a beneficiary</option>' + list.map((beneficiary) => `
    <option value="${escapeHtml(beneficiary.id)}">${escapeHtml(beneficiary.name)} — ${escapeHtml(beneficiary.bank)}</option>
  `).join("");
  if (list.some((beneficiary) => beneficiary.id === previousValue)) select.value = previousValue;
}

function renderAll() {
  document.querySelector("#balance-value").textContent = formatMoney(demoData.balance);
  document.querySelector("#wallet-balance").textContent = formatMoney(demoData.balance);
  document.querySelector("#beneficiary-count").textContent = demoData.beneficiaries.length;
  document.querySelector("#transaction-count").textContent = demoData.transactions.length;
  document.querySelector("#recent-transactions").innerHTML = transactionTable(
    demoData.transactions.slice(0, 5), "No activity yet", "Wallet additions and transfers will appear here."
  );
  document.querySelector("#transaction-list").innerHTML = transactionTable(
    demoData.transactions, "No transactions yet", "Confirmed practice transfers will appear here."
  );
  document.querySelector("#transfer-amount").max = Math.max(0, demoData.balance).toFixed(2);
  document.querySelector("#transfer-limit").textContent =
    `Maximum transfer: ${formatMoney(Math.max(0, demoData.balance))} (available practice balance).`;
  renderBeneficiaries();
  renderFeedback();
}

function renderFeedback() {
  const target = document.querySelector("#feedback-list");
  if (!demoData.feedback.length) {
    target.innerHTML = '<div class="empty-state"><strong>No feedback yet</strong>Your submitted feedback will appear here.</div>';
    return;
  }
  target.innerHTML = demoData.feedback.slice(0, 8).map((item) => `
    <article class="feedback-entry">
      <div class="feedback-meta">
        <strong>${escapeHtml(item.topic)}</strong>
        <span>${escapeHtml(item.rating)}/5</span>
      </div>
      <p>${escapeHtml(item.message)}</p>
      <time>${escapeHtml(formatDate(item.createdAt))}</time>
    </article>
  `).join("");
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(authMessage);
  const formData = new FormData(authForm);
  const username = String(formData.get("username")).trim();
  const normalizedUsername = username.toLowerCase();
  const password = String(formData.get("password"));
  const credentials = getCredentials(normalizedUsername);

  authSubmit.disabled = true;
  authSubmit.textContent = "Please wait…";
  try {
    if (authMode === "create") {
      if (credentials) {
        setMessage(authMessage, "That username is already in use. Choose another one or log in.", "error");
        return;
      }
      if (password !== String(formData.get("confirm-password"))) {
        setMessage(authMessage, "The passwords do not match. Please check both fields.", "error");
        return;
      }
      const result = await hashPassword(password);
      const account = { username, normalizedUsername, salt: result.salt, passwordHash: result.hash };
      const accounts = getCredentials();
      if (!saveStoredJson(ACCOUNT_KEY, [...accounts, account])) {
        setMessage(authMessage, "The account could not be saved. Check whether browser storage is available.", "error");
        return;
      }
      const activityStore = readActivityStore();
      activityStore.users.push({ normalizedUsername, activity: freshDemoData() });
      if (!saveStoredJson(DATA_KEY, activityStore)) {
        if (accounts.length) saveStoredJson(ACCOUNT_KEY, accounts);
        else localStorage.removeItem(ACCOUNT_KEY);
        setMessage(authMessage, "The account could not be saved. Check whether browser storage is available.", "error");
        return;
      }
      enterDemo(username);
      setMessage(appMessage, "Account created. Your practice balance is not real money.", "success");
    } else {
      if (!credentials) {
        setMessage(authMessage, "No account was found for that username. Create one below or try again.", "error");
        return;
      }
      if (normalizedUsername !== credentials.normalizedUsername) {
        setMessage(authMessage, "That username or password was not recognized.", "error");
        return;
      }
      const result = await hashPassword(password, credentials.salt);
      if (result.hash !== credentials.passwordHash) {
        setMessage(authMessage, "That username or password was not recognized.", "error");
        return;
      }
      enterDemo(credentials.username);
    }
  } catch (error) {
    setMessage(authMessage, error.message || "Sign in could not be completed.", "error");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "create" ? "Create account" : "Log in";
  }
});

document.querySelector("#auth-toggle").addEventListener("click", () => {
  authForm.reset();
  clearMessage(authMessage);
  setAuthMode(authMode === "create" ? "login" : "create");
});

authForm.addEventListener("reset", () => clearMessage(authMessage));

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.go));
});

document.querySelector("#logout-button").addEventListener("click", () => {
  demoData = null;
  pendingTransfer = null;
  currentNormalizedUsername = null;
  document.querySelector("#transfer-confirmation").classList.add("is-hidden");
  document.querySelector("#transfer-form").classList.remove("is-hidden");
  authForm.reset();
  clearMessage(authMessage);
  clearMessage(appMessage);
  authScreen.classList.remove("is-hidden");
  bankApp.classList.add("is-hidden");
  setAuthMode("login");
});

document.querySelector("#wallet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const amountText = String(values.get("amount")).trim();
  const amount = Number(amountText);
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    setMessage(appMessage, "Enter an amount from ₹0.01 to ₹1,00,000 with no more than two decimal places.", "error");
    return;
  }

  const deposit = {
    kind: "deposit",
    reference: makeReference(),
    beneficiaryName: "Wallet addition",
    amount: Math.round(amount * 100) / 100,
    note: String(values.get("note")).trim(),
    status: "Success",
    createdAt: new Date().toISOString()
  };
  const oldBalance = demoData.balance;
  demoData.balance = Math.round((demoData.balance + deposit.amount) * 100) / 100;
  demoData.transactions.unshift(deposit);
  if (!saveActivity()) {
    demoData.balance = oldBalance;
    demoData.transactions.shift();
    return;
  }
  form.reset();
  renderAll();
  setMessage(appMessage, `Added ${formatMoney(deposit.amount)} to your practice wallet. Reference: ${deposit.reference}`, "success");
});

document.querySelector("#wallet-form").addEventListener("reset", () => clearMessage(appMessage));

document.querySelector("#calculator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const first = Number(values.get("first"));
  const second = Number(values.get("second"));
  const operation = String(values.get("operation"));
  const symbols = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
  const resultElement = document.querySelector("#calculator-result");
  let result;

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    resultElement.textContent = "Enter two valid numbers.";
    resultElement.classList.add("error");
    return;
  }
  if (operation === "divide" && second === 0) {
    resultElement.textContent = "Cannot divide by zero.";
    resultElement.classList.add("error");
    return;
  }
  switch (operation) {
    case "add": result = first + second; break;
    case "subtract": result = first - second; break;
    case "multiply": result = first * second; break;
    case "divide": result = first / second; break;
    default:
      resultElement.textContent = "Choose a valid operation.";
      resultElement.classList.add("error");
      return;
  }
  if (!Number.isFinite(result)) {
    resultElement.textContent = "The result is too large to display.";
    resultElement.classList.add("error");
    return;
  }
  const cleanNumber = (value) => Number(value.toPrecision(12)).toString();
  resultElement.textContent = `${cleanNumber(first)} ${symbols[operation]} ${cleanNumber(second)} = ${cleanNumber(result)}`;
  resultElement.classList.remove("error");
});

document.querySelector("#calculator-form").addEventListener("reset", () => {
  const resultElement = document.querySelector("#calculator-result");
  resultElement.textContent = "Your result will appear here.";
  resultElement.classList.remove("error");
});

document.querySelector("#feedback-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const message = String(values.get("message")).trim();
  const rating = Number(values.get("rating"));
  if (message.length < 5 || message.length > 500 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    setMessage(appMessage, "Enter feedback of at least 5 characters and choose a rating.", "error");
    return;
  }
  const feedback = {
    topic: String(values.get("topic")),
    rating,
    message,
    createdAt: new Date().toISOString()
  };
  demoData.feedback.unshift(feedback);
  if (!saveActivity()) {
    demoData.feedback.shift();
    return;
  }
  form.reset();
  renderFeedback();
  setMessage(appMessage, "Thank you. Your feedback was saved in this browser.", "success");
});

document.querySelector("#feedback-form").addEventListener("reset", () => clearMessage(appMessage));

document.querySelector("#beneficiary-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const account = String(values.get("account")).trim();
  const confirmedAccount = String(values.get("account-confirm")).trim();
  const ifsc = String(values.get("ifsc")).trim().toUpperCase();
  if (!/^\d{6,18}$/.test(account)) {
    setMessage(appMessage, "Use 6–18 digits for a fictional account number.", "error");
    return;
  }
  if (account !== confirmedAccount) {
    setMessage(appMessage, "The account numbers do not match. Please check both fields.", "error");
    return;
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    setMessage(appMessage, "Enter an IFSC code in the format ABCD0123456.", "error");
    return;
  }
  const beneficiary = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: String(values.get("name")).trim(),
    bank: String(values.get("bank")).trim(),
    account,
    ifsc
  };
  demoData.beneficiaries.unshift(beneficiary);
  if (saveActivity()) {
    form.reset();
    renderAll();
    setMessage(appMessage, "Beneficiary saved on this device.", "success");
  } else {
    demoData.beneficiaries.shift();
  }
});

document.querySelector("#beneficiary-form").addEventListener("reset", () => clearMessage(appMessage));
document.querySelector("#cancel-beneficiary").addEventListener("click", () => {
  document.querySelector("#beneficiary-form").reset();
  showView("dashboard-view");
});

document.querySelector("#transfer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formValues = new FormData(form);
  const beneficiary = demoData.beneficiaries.find((item) => item.id === formValues.get("beneficiary"));
  const amountText = String(formValues.get("amount")).trim();
  const amount = Number(amountText);
  if (!beneficiary) {
    setMessage(appMessage, "Add and select a beneficiary before making a transfer.", "error");
    return;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
    setMessage(appMessage, "Enter a valid amount greater than zero with no more than two decimal places.", "error");
    return;
  }
  if (amount > demoData.balance) {
    setMessage(appMessage, "The amount is more than the available practice balance.", "error");
    return;
  }
  pendingTransfer = {
    beneficiaryId: beneficiary.id,
    amount: Math.round(amount * 100) / 100,
    note: String(formValues.get("note")).trim()
  };
  document.querySelector("#transfer-summary").innerHTML = `
    <strong>${escapeHtml(formatMoney(pendingTransfer.amount))} to ${escapeHtml(beneficiary.name)}</strong>
    <p>${escapeHtml(beneficiary.bank)} · fictional account ending ${escapeHtml(beneficiary.account.slice(-4))}</p>
    ${pendingTransfer.note ? `<p>Note: ${escapeHtml(pendingTransfer.note)}</p>` : ""}
    <p>This confirmation only changes the local practice balance and transaction list.</p>`;
  form.classList.add("is-hidden");
  document.querySelector("#transfer-confirmation").classList.remove("is-hidden");
  clearMessage(appMessage);
});

document.querySelector("#cancel-transfer").addEventListener("click", () => {
  pendingTransfer = null;
  document.querySelector("#transfer-confirmation").classList.add("is-hidden");
  document.querySelector("#transfer-form").classList.remove("is-hidden");
  clearMessage(appMessage);
});

document.querySelector("#confirm-transfer").addEventListener("click", () => {
  if (!pendingTransfer) return;
  const beneficiary = demoData.beneficiaries.find((item) => item.id === pendingTransfer.beneficiaryId);
  if (!beneficiary || pendingTransfer.amount > demoData.balance) {
    pendingTransfer = null;
    document.querySelector("#transfer-confirmation").classList.add("is-hidden");
    document.querySelector("#transfer-form").classList.remove("is-hidden");
    setMessage(appMessage, "The transfer could not be confirmed. Please review the balance and beneficiary.", "error");
    return;
  }
  const oldBalance = demoData.balance;
  const transaction = {
    kind: "transfer",
    reference: makeReference(),
    beneficiaryId: beneficiary.id,
    beneficiaryName: beneficiary.name,
    amount: pendingTransfer.amount,
    note: pendingTransfer.note,
    status: "Success",
    createdAt: new Date().toISOString()
  };
  demoData.balance = Math.round((demoData.balance - pendingTransfer.amount) * 100) / 100;
  demoData.transactions.unshift(transaction);
  if (!saveActivity()) {
    demoData.balance = oldBalance;
    demoData.transactions.shift();
    setMessage(appMessage, "Failed: this transfer could not be saved. The balance is unchanged.", "error");
    return;
  }
  pendingTransfer = null;
  document.querySelector("#transfer-confirmation").classList.add("is-hidden");
  const transferForm = document.querySelector("#transfer-form");
  transferForm.reset();
  transferForm.classList.remove("is-hidden");
  renderAll();
  showView("transactions-view");
    setMessage(appMessage, `Practice transfer completed. Reference: ${transaction.reference}`, "success");
});

document.querySelector("#transfer-form").addEventListener("reset", () => {
  pendingTransfer = null;
  document.querySelector("#transfer-confirmation").classList.add("is-hidden");
  document.querySelector("#transfer-form").classList.remove("is-hidden");
  clearMessage(appMessage);
});

document.querySelector("#reference-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = String(new FormData(event.currentTarget).get("reference")).trim().toLowerCase();
  const transaction = demoData.transactions.find((item) => item.reference.toLowerCase() === query);
  const target = document.querySelector("#reference-result");
  if (!transaction) {
    target.innerHTML = '<div class="message visible error">No activity matched that reference.</div>';
    return;
  }
  const isDeposit = transaction.kind === "deposit";
  const amountPrefix = isDeposit ? "+" : "−";
  const activityName = isDeposit ? "Wallet addition" : transaction.beneficiaryName;
  target.innerHTML = `<div class="search-card">
    <span class="status ${statusClass(transaction.status)}">${escapeHtml(transaction.status)}</span>
    <p>${amountPrefix}${escapeHtml(formatMoney(transaction.amount))} · ${escapeHtml(activityName)}</p>
    <p>Reference: <span class="mono">${escapeHtml(transaction.reference)}</span></p>
    <p>Created: ${escapeHtml(formatDate(transaction.createdAt))}</p>
  </div>`;
});

document.querySelector("#clear-search").addEventListener("click", () => {
  document.querySelector("#reference-form").reset();
  document.querySelector("#reference-result").innerHTML = "";
});

// On first visit, show account setup; later visits require a fresh sign-in.
setAuthMode("login");
