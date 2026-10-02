"use client";
import React, { useEffect, useState, useRef } from "react";
import { Button, Dropdown, Space, Typography } from "antd";
import { GlobalOutlined, CheckOutlined } from "@ant-design/icons";

const { Text } = Typography;

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "hi", label: "हिंदी", flag: "🇮🇳" },
  { code: "gu", label: "ગુજરાતી", flag: "🇮🇳" },
];

// The googtrans cookie may exist for several domain variants (no domain,
// "host", ".host", and the parent domain like ".example.com" — Google sets the
// dotted variant on deployed sites). To reliably change language we must
// write/delete the cookie for EVERY variant, otherwise a stale copy survives
// and the page keeps translating to the old language after reload.
const cookieDomainVariants = () => {
  const host = window.location.hostname;
  const variants = [null, host, `.${host}`];
  const parts = host.split(".");
  if (parts.length > 2) variants.push("." + parts.slice(-2).join("."));
  return variants;
};

const setGoogTransCookie = (value) => {
  cookieDomainVariants().forEach((d) => {
    const domain = d ? `; domain=${d}` : "";
    if (value === null) {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domain}`;
    } else {
      document.cookie = `googtrans=${value}; path=/${domain}`;
    }
  });
};

const readGoogTransLang = () => {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
  if (!m || !m[1]) return null;
  // cookie format: /en/hi  →  target language is the last segment
  const code = decodeURIComponent(m[1]).split("/").pop();
  return code || null;
};

const GoogleTranslate = () => {
  const [active, setActive] = useState(LANGUAGES[0]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Show the language the page is ACTUALLY in (from the cookie) — before,
    // the button always showed "English" after a reload even in Hindi mode.
    const currentCode = readGoogTransLang();
    const current = LANGUAGES.find((l) => l.code === currentCode);
    if (current) setActive(current);

    if (!document.getElementById("google-translate-script")) {
      const s = document.createElement("script");
      s.id = "google-translate-script";
      s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      document.body.appendChild(s);
    }

    window.googleTranslateElementInit = () => {
      if (window.google?.translate) {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: "en,hi,gu",
            autoDisplay: false,
          },
          "google_translate_element"
        );
      }
    };
  }, []);

  const switchLang = (lang) => {
    setActive(lang);

    if (lang.code === "en") {
      // Delete the cookie on ALL domain variants, then force /en/en so any
      // variant that somehow survives still means "no translation".
      setGoogTransCookie(null);
      setGoogTransCookie("/en/en");
      window.location.reload();
      return;
    }

    // Write the target language on all variants so it survives reloads
    setGoogTransCookie(null);
    setGoogTransCookie(`/en/${lang.code}`);

    const sel = document.querySelector(".goog-te-combo");
    if (sel) {
      sel.value = lang.code;
      sel.dispatchEvent(new Event("change"));
    } else {
      // Widget not ready yet — the cookie is set, a reload applies it
      window.location.reload();
    }
  };

  const items = LANGUAGES.map((lang) => ({
    key: lang.code,
    label: (
      <Space style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Space>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{lang.flag}</span>
          <span>{lang.label}</span>
        </Space>
        {active.code === lang.code && (
          <CheckOutlined style={{ color: "var(--ant-color-primary, #667eea)", fontSize: 14 }} />
        )}
      </Space>
    ),
    onClick: () => switchLang(lang),
  }));

  return (
    <>
      <div id="google_translate_element" style={{ display: "none" }} />
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
        <Button
          type="text"
          icon={<GlobalOutlined style={{ fontSize: 18 }} />}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-primary)" }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, marginRight: 2 }}>{active.flag}</span>
          <Text style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1 }}>
            {active.label}
          </Text>
        </Button>
      </Dropdown>
    </>
  );
};

export default GoogleTranslate;
