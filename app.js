import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBB3mGeMrqj8-X-lObl7Ij789sQELTN6O4",
  authDomain: "monetra-8e551.firebaseapp.com",
  projectId: "monetra-8e551",
  storageBucket: "monetra-8e551.firebasestorage.app",
  messagingSenderId: "896339503212",
  appId: "1:896339503212:web:4a43238fdd5be2bc01d049"
};

const firebaseReady = !firebaseConfig.apiKey.startsWith("COLE_");
const app = firebaseReady ? initializeApp(firebaseConfig) : null;
const auth = firebaseReady ? getAuth(app) : null;
const db = firebaseReady ? getFirestore(app) : null;
const provider = firebaseReady ? new GoogleAuthProvider() : null;
const root = document.querySelector("#app");

let user = null;
let currentPage = "financas";
let saveTimer = null;
let state = {
  theme: "dark",
  meta: 30,
  mes: new Date().getMonth(),
  ano: "2026",
  entradas: [
    { label: "Salario", value: 2500 },
    { label: "Vale alimentacao", value: 550 },
    { label: "Vale transporte", value: 242 }
  ],
  saidas: [
    { label: "Financiamento carro", value: 1014 },
    { label: "Ajuda a mae", value: 250 },
    { label: "Seguro do carro", value: 169 },
    { label: "IPVA", value: 187 },
    { label: "Gasolina", value: 300 }
  ],
  dividas: [],
  periodos: {},
};

function periodKey() {
  return `${state.ano}-${String(state.mes + 1).padStart(2, "0")}`;
}

function saveCurrentPeriod() {
  state.periodos[periodKey()] = {
    meta: state.meta,
    entradas: structuredClone(state.entradas),
    saidas: structuredClone(state.saidas),
    dividas: structuredClone(state.dividas)
  };
}

function loadCurrentPeriod() {
  const period = state.periodos[periodKey()];
  state.meta = period?.meta ?? 30;
  state.entradas = structuredClone(period?.entradas ?? []);
  state.saidas = structuredClone(period?.saidas ?? []);
  state.dividas = structuredClone(period?.dividas ?? []);
}

// Preserva os dados iniciais no mês atual e inicia a estrutura por competência.
saveCurrentPeriod();

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Nunca deixe a página vazia enquanto o Firebase restaura a sessão.
renderLogin();

// Finaliza o retorno do login por redirecionamento, usado no Firefox.
getRedirectResult(auth).catch((error) => {
  console.error("Erro no retorno do login com Google:", error);
  showLoginError("Não foi possível concluir o login com Google.");
});

if (firebaseReady) {
  onAuthStateChanged(
    auth,
    async (nextUser) => {
      user = nextUser;
      if (user) {
        // Mostra o painel imediatamente; os dados remotos entram assim que chegarem.
        renderApp();
        try {
          await loadUserData();
          renderApp();
        } catch (error) {
          console.error("Não foi possível carregar os dados do Firestore:", error);
        }
      } else {
        renderLogin();
      }
    },
    (error) => {
      console.error("Não foi possível iniciar o Firebase Authentication:", error);
      user = null;
      renderLogin();
    }
  );
}

function renderLogin() {
  document.body.classList.toggle("dark", state.theme === "dark");
  root.innerHTML = `
    <section class="login">
      <div class="login-brand">
        <span class="login-logo">M</span>
        <h1>Monetra</h1>
        <p>Seu dinheiro, suas escolhas, seu futuro.</p>
      </div>
      <div class="login-card">
        <h2 id="auth-title">Bem-vindo de volta</h2>
        <p class="muted" id="auth-subtitle">Entre para acessar sua conta.</p>
        ${firebaseReady ? "" : `<p class="badge badge-red">Configure o Firebase em app.js antes de publicar.</p>`}
        <form id="email-auth-form">
          <label class="login-label" for="auth-email">E-mail</label>
          <input class="login-input" id="auth-email" type="email" autocomplete="email" placeholder="voce@email.com" required>
          <label class="login-label" for="auth-password">Senha</label>
          <input class="login-input" id="auth-password" type="password" autocomplete="current-password" placeholder="Sua senha" minlength="6" required>
          <p class="login-error" id="login-error" role="alert"></p>
          <button class="login-primary" id="email-submit" type="submit">Entrar</button>
        </form>
        <div class="login-divider"><span>ou continue com</span></div>
        <button class="google-btn" id="login-google" type="button"><span class="google-g">G</span> Google</button>
        <p class="auth-switch"><span id="auth-switch-text">Ainda não tem uma conta?</span> <button id="toggle-auth-mode" type="button">Criar conta</button></p>
      </div>
    </section>
  `;
  document.querySelector("#login-google").addEventListener("click", login);
  const form = document.querySelector("#email-auth-form");
  const password = document.querySelector("#auth-password");
  let createMode = false;
  form.addEventListener("submit", (event) => emailLogin(event, createMode));
  document.querySelector("#toggle-auth-mode").addEventListener("click", () => {
    createMode = !createMode;
    document.querySelector("#auth-title").textContent = createMode ? "Crie sua conta" : "Bem-vindo de volta";
    document.querySelector("#auth-subtitle").textContent = createMode ? "Comece agora com o Monetra." : "Entre para acessar sua conta.";
    document.querySelector("#email-submit").textContent = createMode ? "Criar conta" : "Entrar";
    document.querySelector("#auth-switch-text").textContent = createMode ? "Já possui uma conta?" : "Ainda não tem uma conta?";
    document.querySelector("#toggle-auth-mode").textContent = createMode ? "Entrar" : "Criar conta";
    password.autocomplete = createMode ? "new-password" : "current-password";
    showLoginError("");
  });
}

async function emailLogin(event, createMode) {
  event.preventDefault();
  if (!firebaseReady) return showLoginError("O Firebase ainda não foi configurado.");
  const email = document.querySelector("#auth-email").value.trim();
  const password = document.querySelector("#auth-password").value;
  const submitButton = document.querySelector("#email-submit");
  try {
    showLoginError("");
    submitButton.disabled = true;
    submitButton.textContent = createMode ? "Criando conta..." : "Entrando...";
    const credential = createMode
      ? await createUserWithEmailAndPassword(auth, email, password)
      : await signInWithEmailAndPassword(auth, email, password);
    user = credential.user;
    renderApp();
  } catch (error) {
    console.error("Erro na autenticação por e-mail:", error);
    const messages = {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/email-already-in-use": "Este e-mail já possui uma conta.",
      "auth/invalid-email": "Digite um e-mail válido.",
      "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente."
    };
    showLoginError(messages[error.code] || "Não foi possível autenticar. Tente novamente.");
    submitButton.disabled = false;
    submitButton.textContent = createMode ? "Criar conta" : "Entrar";
  }
}

function showLoginError(message) {
  const element = document.querySelector("#login-error");
  if (element) element.textContent = message;
}

async function login() {
  if (!firebaseReady) {
    alert("Configure o Firebase em app.js para ativar o login Google.");
    return;
  }
  const button = document.querySelector("#login-google");
  try {
    button.disabled = true;
    button.innerHTML = "Conectando ao Google...";
    if (navigator.userAgent.toLowerCase().includes("firefox")) {
      sessionStorage.setItem("monetra-google-login", "pending");
      await signInWithRedirect(auth, provider);
      return;
    }
    const credential = await signInWithPopup(auth, provider);
    user = credential.user;
    renderApp();
  } catch (error) {
    console.error("Erro no login com Google:", error);
    alert(`Não foi possível entrar: ${error.code || error.message}`);
    button.disabled = false;
    button.innerHTML = '<span class="google-g">G</span> Google';
  }
}

async function logout() {
  const button = document.querySelector("#logout");
  if (button) {
    button.disabled = true;
    button.textContent = "Saindo...";
  }

  clearTimeout(saveTimer);
  // O Firestore não pode impedir o usuário de encerrar a sessão.
  await Promise.race([
    saveNow(),
    new Promise((resolve) => setTimeout(resolve, 1200))
  ]);

  try {
    await signOut(auth);
    user = null;
    renderLogin();
  } catch (error) {
    console.error("Não foi possível sair da conta:", error);
    if (button) {
      button.disabled = false;
      button.textContent = "Sair da conta";
    }
    alert("Não foi possível sair da conta. Tente novamente.");
  }
}

async function loadUserData() {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const saved = snap.data();
    state = { ...state, ...saved, periodos: saved.periodos || {} };
    // Migração automática dos dados antigos, que não eram separados por mês.
    if (!state.periodos[periodKey()]) saveCurrentPeriod();
    loadCurrentPeriod();
  }
  document.body.classList.toggle("dark", state.theme === "dark");
}

function queueSave() {
  saveCurrentPeriod();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 450);
}

async function saveNow() {
  if (!firebaseReady || !user) return;
  try {
    await setDoc(doc(db, "users", user.uid), state, { merge: true });
  } catch (error) {
    console.error("Não foi possível salvar os dados no Firestore:", error);
  }
}

function renderApp() {
  document.body.classList.toggle("dark", state.theme === "dark");
  root.innerHTML = `
    <section class="app-shell">
      ${renderHeader()}
      <div id="page"></div>
      <nav class="tab-bar">
        ${tabButton("financas", "$", "Visão geral")}
        ${tabButton("dividas", "!", "Dividas")}
        ${tabButton("regras", "?", "Regras")}
      </nav>
    </section>
  `;
  document.querySelector("#toggle-theme").addEventListener("click", toggleTheme);
  const accountButton = document.querySelector("#account-button");
  const accountMenu = document.querySelector("#account-menu");
  accountButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !accountMenu.hidden;
    accountMenu.hidden = isOpen;
    accountButton.setAttribute("aria-expanded", String(!isOpen));
    if (isOpen) return;
    document.addEventListener("click", () => {
      accountMenu.hidden = true;
      accountButton.setAttribute("aria-expanded", "false");
    }, { once: true });
  });
  accountMenu.addEventListener("click", (event) => event.stopPropagation());
  document.querySelector("#logout").addEventListener("click", logout);
  const monthSelect = document.querySelector("#mes");
  const yearSelect = document.querySelector("#ano");
  if (monthSelect && yearSelect) {
    monthSelect.addEventListener("change", (event) => {
      saveCurrentPeriod();
      state.mes = Number(event.target.value);
      loadCurrentPeriod();
      queueSave();
      renderApp();
    });
    yearSelect.addEventListener("change", (event) => {
      saveCurrentPeriod();
      state.ano = event.target.value;
      loadCurrentPeriod();
      queueSave();
      renderApp();
    });
  }
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      currentPage = button.dataset.page;
      renderApp();
    });
  });
  renderPage();
}

function renderHeader() {
  return `
    <header class="header">
      <div class="header-top">
        <div>
          <h1>${currentPage === "financas" ? "Monetra" : currentPage === "dividas" ? "Dividas" : "Regras"}</h1>
          <p class="header-sub">${currentPage === "financas" ? "Planejamento mensal" : currentPage === "dividas" ? "Pendencias e atrasados" : "Seu guia de decisao financeira"}</p>
        </div>
        <div class="header-actions">
          ${currentPage === "financas" ? monthControls() : ""}
          <button class="pill-btn" id="toggle-theme">${state.theme === "dark" ? "Claro" : "Escuro"}</button>
          <div class="account">
            <button class="account-button" id="account-button" aria-label="Abrir menu da conta" aria-haspopup="true" aria-expanded="false">
              ${user.photoURL ? `<img src="${escapeAttr(user.photoURL)}" alt="">` : `<span>${escapeAttr((user.displayName || user.email || "U").charAt(0).toUpperCase())}</span>`}
            </button>
            <div class="account-menu" id="account-menu" hidden>
              <div class="account-user">
                <strong>${escapeAttr(user.displayName || "Minha conta")}</strong>
                <small>${escapeAttr(user.email || "")}</small>
              </div>
              <button id="logout" class="logout-button">Sair da conta</button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}

function monthControls() {
  return `
    <select class="pill-select" id="mes">
      ${months.map((month, index) => `<option value="${index}" ${state.mes === index ? "selected" : ""}>${month}</option>`).join("")}
    </select>
    <select class="pill-select" id="ano">
      ${["2025", "2026", "2027"].map((year) => `<option ${state.ano === year ? "selected" : ""}>${year}</option>`).join("")}
    </select>
  `;
}

function tabButton(page, icon, label) {
  return `<button class="tab-btn ${currentPage === page ? "active" : ""}" data-page="${page}"><span class="tab-icon">${icon}</span>${label}</button>`;
}

function renderPage() {
  const page = document.querySelector("#page");
  if (currentPage === "financas") renderFinancas(page);
  if (currentPage === "dividas") renderDividas(page);
  if (currentPage === "regras") renderRegras(page);
}

function renderFinancas(container) {
  const renda = sum(state.entradas);
  const despesas = sum(state.saidas);
  const meta = renda * state.meta / 100;
  const livre = renda - despesas - meta;
  container.innerHTML = `
    <div class="metrics">
      ${metric("Renda total", fmt(renda), "var(--green)")}
      ${metric("Despesas", fmt(despesas), "var(--red)")}
      ${metric("Poupanca", fmt(meta), "var(--amber)")}
      ${metric("Disponivel", `${livre < 0 ? "- " : ""}${fmt(livre)}`, livre >= 0 ? "var(--green)" : "var(--red)")}
    </div>
    ${distribution(renda, despesas, meta, livre)}
    ${fieldSection("Entradas", "entradas", "var(--green)", "Adicionar entrada")}
    ${fieldSection("Saidas fixas", "saidas", "var(--red)", "Adicionar saida")}
    <section class="section">
      <h2 class="section-title">Meta de poupanca</h2>
      <div class="card">
        <div class="meta-row">
          <span>Percentual da renda</span>
          <div><input class="meta-input" id="meta-pct" type="number" value="${state.meta}" min="0" max="100"> %</div>
        </div>
        <div class="situacao-row">
          <span class="muted">Situacao</span>
          <span class="badge ${livre >= 0 ? "badge-green" : "badge-red"}">${livre >= 0 ? "Meta atingivel" : "Renda insuficiente"}</span>
        </div>
      </div>
    </section>
    <div class="spacer"></div>
  `;
  bindFinanceInputs();
}

function metric(label, value, color) {
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value" style="color:${color}">${value}</div></div>`;
}

function distribution(renda, despesas, meta, livre) {
  const safe = Math.max(renda, despesas + meta + Math.max(livre, 0), 1);
  return `
    <div class="barra-wrap">
      <div class="card barra-card">
        <div class="barra-legenda">
          ${legend("Despesas " + pct(despesas, renda), "var(--red)")}
          ${legend("Poupanca " + pct(meta, renda), "var(--amber)")}
          ${legend("Livre " + pct(livre, renda), "var(--green)")}
        </div>
        <div class="barra">
          <div style="flex:${despesas / safe};background:var(--red)"></div>
          <div style="flex:${meta / safe};background:var(--amber)"></div>
          <div style="flex:${Math.max(livre, 0) / safe};background:var(--green)"></div>
        </div>
      </div>
    </div>
  `;
}

function legend(text, color) {
  return `<span class="barra-item"><span class="barra-dot" style="background:${color}"></span>${text}</span>`;
}

function fieldSection(title, key, color, addLabel) {
  const total = sum(state[key]);
  return `
    <section class="section">
      <h2 class="section-title">${title}</h2>
      <div class="card">
        ${state[key].map((item, index) => `
          <div class="field-row">
            <input class="field-label-input" data-key="${key}" data-index="${index}" data-field="label" value="${escapeAttr(item.label)}" placeholder="Descricao">
            ${item.parcelada ? `<span class="installment-badge">${item.parcela}/${item.parcelas}</span>` : ""}
            <span class="field-prefix">R$</span>
            <input class="field-value" data-key="${key}" data-index="${index}" data-field="value" type="number" value="${item.value}" min="0" step="0.01" style="color:${color}">
            <button class="remove-btn" data-remove="${key}" data-index="${index}">x</button>
          </div>
        `).join("")}
        <div class="total-row"><span>Total ${title.toLowerCase()}</span><span style="color:${color}">${fmt(total)}</span></div>
        <button class="add-btn" data-add="${key}">+ ${addLabel}</button>
        ${key === "saidas" ? `<button class="add-btn installment-add" id="add-installment">+ Adicionar saída parcelada</button>` : ""}
      </div>
    </section>
  `;
}

function bindFinanceInputs() {
  document.querySelectorAll("[data-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = state[input.dataset.key][Number(input.dataset.index)];
      item[input.dataset.field] = input.dataset.field === "value" ? Number(input.value || 0) : input.value;
      queueSave();
    });
    input.addEventListener("change", () => {
      renderPage();
    });
  });
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      state[button.dataset.add].push({ label: "", value: 0 });
      queueSave();
      renderPage();
    });
  });
  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state[button.dataset.remove].splice(Number(button.dataset.index), 1);
      queueSave();
      renderPage();
    });
  });
  const installmentButton = document.querySelector("#add-installment");
  if (installmentButton) installmentButton.addEventListener("click", addInstallment);
  document.querySelector("#meta-pct").addEventListener("input", (event) => {
    state.meta = Number(event.target.value || 0);
    queueSave();
  });
  document.querySelector("#meta-pct").addEventListener("change", () => {
    renderPage();
  });
}

function addInstallment() {
  const label = prompt("Descrição da compra parcelada:");
  if (!label?.trim()) return;
  const total = Number(prompt("Valor total da compra (R$):")?.replace(",", "."));
  if (!Number.isFinite(total) || total <= 0) return alert("Digite um valor total válido.");
  const installments = Number(prompt("Quantidade de parcelas:", "2"));
  if (!Number.isInteger(installments) || installments < 2 || installments > 120) {
    return alert("Digite uma quantidade entre 2 e 120 parcelas.");
  }

  saveCurrentPeriod();
  const monthlyValue = Number((total / installments).toFixed(2));
  let year = Number(state.ano);
  let month = state.mes;

  for (let number = 1; number <= installments; number += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const period = state.periodos[key] || { meta: 30, entradas: [], saidas: [], dividas: [] };
    period.saidas = period.saidas || [];
    period.saidas.push({
      label: label.trim(),
      value: number === installments ? Number((total - monthlyValue * (installments - 1)).toFixed(2)) : monthlyValue,
      parcelada: true,
      parcela: number,
      parcelas: installments,
      valorTotal: total
    });
    state.periodos[key] = period;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  loadCurrentPeriod();
  queueSave();
  renderPage();
}

function renderDividas(container) {
  const total = state.dividas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const pago = state.dividas.reduce((acc, item) => acc + Number(item.pago || 0), 0);
  const restante = Math.max(total - pago, 0);
  container.innerHTML = `
    <div class="metrics">
      ${metric("Total em aberto", fmt(total), "var(--red)")}
      ${metric("Ja pago", fmt(pago), "var(--green)")}
      ${metric("Restante", fmt(restante), "var(--amber)")}
      ${metric("Itens em aberto", String(state.dividas.filter((item) => Number(item.pago || 0) < Number(item.total || 0)).length), "var(--text-muted)")}
    </div>
    <section class="section">
      <h2 class="section-title">Pendencias</h2>
      <div class="card">
        ${state.dividas.map((item, index) => dividaRow(item, index)).join("")}
        <button class="add-btn" id="add-divida">+ Adicionar divida</button>
      </div>
    </section>
    <div class="spacer"></div>
  `;
  bindDebtInputs();
}

function dividaRow(item, index) {
  const total = Number(item.total || 0);
  const pago = Number(item.pago || 0);
  const statusColor = pago <= 0 ? "var(--red)" : pago >= total ? "var(--green)" : "var(--amber)";
  return `
    <div class="divida-row">
      <div class="divida-top">
        <span class="divida-status-dot" style="background:${statusColor}"></span>
        <input class="divida-nome" data-debt="${index}" data-field="nome" value="${escapeAttr(item.nome || "")}" placeholder="Nome da divida">
        <button class="remove-btn" data-remove-debt="${index}">x</button>
      </div>
      <div class="divida-bottom">
        ${debtInput(index, "total", "Valor total", total, "var(--red)")}
        ${debtInput(index, "pago", "Ja pago", pago, "var(--green)")}
        <div><div class="divida-campo-label">Restante</div><strong style="color:var(--amber)">${fmt(total - pago)}</strong></div>
      </div>
    </div>
  `;
}

function debtInput(index, field, label, value, color) {
  return `<div><div class="divida-campo-label">${label}</div><input class="divida-input" data-debt="${index}" data-field="${field}" type="number" value="${value}" min="0" step="0.01" style="color:${color}"></div>`;
}

function bindDebtInputs() {
  document.querySelectorAll("[data-debt]").forEach((input) => {
    input.addEventListener("input", () => {
      const item = state.dividas[Number(input.dataset.debt)];
      item[input.dataset.field] = input.dataset.field === "nome" ? input.value : Number(input.value || 0);
      queueSave();
    });
    input.addEventListener("change", () => {
      renderPage();
    });
  });
  document.querySelectorAll("[data-remove-debt]").forEach((button) => {
    button.addEventListener("click", () => {
      state.dividas.splice(Number(button.dataset.removeDebt), 1);
      queueSave();
      renderPage();
    });
  });
  document.querySelector("#add-divida").addEventListener("click", () => {
    state.dividas.push({ nome: "", total: 0, pago: 0, vencimento: "" });
    queueSave();
    renderPage();
  });
}

function renderRegras(container) {
  container.innerHTML = `
    <section class="section">
      ${regra("Delivery", "Pedidos por aplicativo ou presencial", "DEBITO", "Sempre no debito.", "Comida e consumo imediato; nao faz sentido parcelar.")}
      ${regra("Mercado", "Supermercado e compras do dia a dia", "DEBITO", "Sempre no debito.", "Gasto recorrente deve sair do dinheiro disponivel agora.")}
      ${regra("Bem duravel", "Eletrodomestico, eletronico, movel...", "CREDITO", "Parcele se nao houver desconto relevante.", "Se houver desconto de 7% ou mais a vista, prefira debito.")}
      ${regra("Regra de ouro", "Antes de parcelar", "REGRA", "Quando o evento acabar, ainda vou estar pagando?", "Se sim, prefira debito ou poupe antes de comprar.")}
    </section>
  `;
}

function regra(title, subtitle, badge, text, detail) {
  const colorClass = badge === "CREDITO" ? "badge badge-green" : badge === "REGRA" ? "badge badge-red" : "badge badge-green";
  return `
    <article class="regra-card">
      <div class="regra-header">
        <div class="regra-titulo">${title}</div>
        <div class="regra-subtitulo">${subtitle}</div>
      </div>
      <div class="regra-body">
        <span class="regra-badge ${colorClass}">${badge}</span>
        <div>${text}</div>
        <div class="regra-detalhe">${detail}</div>
      </div>
    </article>
  `;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.body.classList.toggle("dark", state.theme === "dark");
  queueSave();
  if (user) renderApp();
  else renderLogin();
}

function sum(items) {
  return items.reduce((acc, item) => acc + Number(item.value || 0), 0);
}

function fmt(value) {
  return "R$ " + Math.abs(Number(value || 0)).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function pct(value, total) {
  return total > 0 ? `${(value / total * 100).toFixed(1)}%` : "0.0%";
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
