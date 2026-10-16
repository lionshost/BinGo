import {
    fetchAuthConfig, getSession, login, loginWithGoogle, register, saveSession
} from "../js/api/auth.js";

const form = document.getElementById("authForm");
const errorBox = document.getElementById("authError");
const submitBtn = document.getElementById("authSubmit");
const nameField = document.getElementById("nameField");
const passwordInput = form.elements.password;
const tabs = [...document.querySelectorAll("[data-mode]")];

let mode = "login";

// Chỉ cho quay lại đường dẫn nội bộ (chống open-redirect qua ?next=).
function nextUrl() {
    const next = new URLSearchParams(location.search).get("next");
    return next && /^\/(?!\/)/.test(next) ? next : "map.html";
}

const done = session => {
    saveSession(session);
    location.replace(nextUrl());
};

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
}

function setMode(next) {
    mode = next;
    for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    nameField.hidden = mode !== "register";
    passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
    submitBtn.textContent = mode === "register" ? "Tạo tài khoản" : "Đăng nhập";
    showError("");
}

for (const tab of tabs) tab.addEventListener("click", () => setMode(tab.dataset.mode));

form.addEventListener("submit", async event => {
    event.preventDefault();
    showError("");
    const email = form.elements.email.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return showError("Vui lòng nhập email và mật khẩu.");
    if (mode === "register" && password.length < 8) return showError("Mật khẩu cần ít nhất 8 ký tự.");

    submitBtn.disabled = true;
    try {
        done(mode === "register"
            ? await register(email, password, form.elements.name.value.trim())
            : await login(email, password));
    } catch (err) {
        showError(err.message);
        submitBtn.disabled = false;
    }
});

async function initGoogle() {
    let clientId;
    try {
        ({ googleClientId: clientId } = await fetchAuthConfig());
    } catch {
        return; // không có backend / chưa cấu hình: ẩn nút Google, form email vẫn dùng được
    }
    if (!clientId) return;

    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
    }).catch(() => null);
    if (!window.google?.accounts?.id) return;

    window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
            showError("");
            try {
                done(await loginWithGoogle(credential));
            } catch (err) {
                showError(err.message);
            }
        }
    });
    window.google.accounts.id.renderButton(document.getElementById("googleButton"), {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 340,
        locale: "vi"
    });
    document.getElementById("googleSection").hidden = false;
}

if (getSession()) location.replace(nextUrl());
else initGoogle();
