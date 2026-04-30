import { useState, useRef, useEffect } from "react";

// ============================================================
// KONFIGURACJA – uzupełnij przed wdrożeniem
// ============================================================
const CONFIG = {
  HOTPAY_URL: "https://platnosc.hotpay.pl",
  HOTPAY_SEKRET: "R2NSV3EvZlRadjdHWDZldFk5b21SdE0zRnBsa2V0ZUZqR0tmeWVGc3lEND0,",
  // KWOTA i CENA_DISPLAY są pobierane dynamicznie z atrybutów elementu
  // lub z meta tagu ustawianego przez WordPress.
  // Ustaw cenę w WP: dodaj do strony shortcode [generator_pup_cena]
  // lub wpisz wprost poniżej jako fallback:
  HOTPAY_KWOTA_FALLBACK: "99.00",
  CENA_DISPLAY_FALLBACK: "99 zł",
  RETURN_URL: "https://wnioski24-generator.vercel.app/?status=sukces",
  FAILURE_URL: "https://wnioski24-generator.vercel.app/?status=blad",
  MAKE_WEBHOOK_URL: "https://hook.eu1.make.com/2kke2q2p33bpw6ckthlygj5hn21o3sa3",
  REGULAMIN_URL: "https://wnioski24.pl/regulamin/",
  POLITYKA_URL: "https://wnioski24.pl/polityka-prywatnosci/",
};

// Dynamiczne pobieranie ceny – zmieniasz TYLKO w WordPressie
// Dodaj meta tag do strony: <meta name="pup-cena" content="149.00">
// lub atrybut data-cena na elemencie #generator-root
function getCena() {
  const meta = document.querySelector('meta[name="pup-cena"]');
  if (meta) return { kwota: meta.getAttribute("content"), display: meta.getAttribute("content").replace(".", ",") + " zł" };
  const root = document.getElementById("generator-root");
  if (root?.dataset?.cena) return { kwota: root.dataset.cena, display: root.dataset.cena.replace(".", ",") + " zł" };
  return { kwota: CONFIG.HOTPAY_KWOTA_FALLBACK, display: CONFIG.CENA_DISPLAY_FALLBACK };
}

// ============================================================
// DEFINICJA KROKÓW
// ============================================================
const STEPS = [
  { id: "kontakt",     label: "Kontakt",      icon: "👤", required: true },
  { id: "dzialalnosc", label: "Działalność",  icon: "🏢", required: true },
  { id: "opis",        label: "Opis biznesu", icon: "📝", required: true },
  { id: "klienci",     label: "Klienci",      icon: "👥", required: false },
  { id: "lokalizacja", label: "Lokalizacja",  icon: "📍", required: true },
  { id: "finanse",     label: "Finanse",      icon: "💰", required: false },
  { id: "wydatki",     label: "Wydatki",      icon: "🛒", required: true },
  { id: "dodatkowe",   label: "Dodatkowo",    icon: "✨", required: false },
  { id: "zamowienie",  label: "Zamówienie",   icon: "✅", required: true },
];

const initData = {
  // Krok 0 – Kontakt
  imie_nazwisko: "", email: "", telefon: "",
  // Krok 1 – Działalność
  pkd1_kod: "", pkd1_nazwa: "", pkd2_kod: "", pkd2_nazwa: "",
  kwota: "", kwota_slownie: "", termin_podjecia: "",
  // Krok 2 – Opis biznesu (wymagane)
  opis_biznesu: "",
  branza: "",
  uprawnienia_wymagane: "nie", uprawnienia_opis: "",
  // Krok 3 – Klienci (opcjonalne)
  klienci_skip: false,
  grupy_klientow: "", sposob_pozyskania: "",
  // Krok 4 – Lokalizacja
  miejscowosc: "",           // miasto/miejscowość działalności – używane do doboru konkurencji
  adres_dzialalnosci: "", status_lokalu: "", powierzchnia_stan: "",
  praca_zdalna: false,
  // Krok 5 – Finanse (opcjonalne)
  finanse_skip: false,
  przychody: [{ nazwa: "", kwota: "" }],
  koszty_stale: [{ nazwa: "", kwota: "" }],
  koszty_zmienne: [{ nazwa: "", kwota: "" }],
  uzasadnienie_finansowe: "",
  // Krok 6 – Wydatki (wymagane)
  wydatki_dotacja: [{ nazwa: "", ilosc: "1 szt.", cena: "", wartosc: "", uzasadnienie: "" }],
  // Krok 7 – Dodatkowe (wszystko opcjonalne)
  mocne: ["", ""],
  slabe: ["", ""],
  szanse: ["", ""],
  zagrozenia: ["", ""],
  swot_skip: false,
  konkurencja: [{ nazwa: "", opis: "" }],
  konkurencja_skip: false,
  plan_dzialan: [{ termin: "", dzialanie: "" }],
  plan_skip: false,
  zatrudnienie: "nie",
  zatrudnienie_szczegoly: "",
  dodatkowe_info: "",
};

// ============================================================
// GŁÓWNA APLIKACJA
// ============================================================
export default function GeneratorPUP() {
  const [step, setStep]           = useState(0);
  const [data, setData]           = useState(initData);
  const [regulamin, setRegulamin] = useState(false);
  const [rodo, setRodo]           = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus]       = useState("form");
  const [genStage, setGenStage]   = useState("");
  const [genStep, setGenStep]     = useState(0);   // krok wizualny 0-4
  const [errors, setErrors]       = useState({});
  const [cena]                    = useState(() => getCena()); // dynamiczna cena
  const topRef = useRef();

  // Sprawdź powrót z HotPay
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status");
    const saved = localStorage.getItem("pup_order_data");
    if (s === "sukces" && saved) {
      const parsed = JSON.parse(saved);
      setData(parsed);
      setStatus("generating");
      runGeneration(parsed);
    } else if (s === "blad") {
      setStatus("error");
    }
  }, []);

  const set    = (f, v) => setData(d => ({ ...d, [f]: v }));
  const setArr = (f, i, sf, v) => setData(d => {
    const a = [...d[f]];
    a[i] = sf ? { ...a[i], [sf]: v } : v;
    return { ...d, [f]: a };
  });
  const addRow = (f, tpl) => setData(d => ({ ...d, [f]: [...d[f], { ...tpl }] }));
  const remRow = (f, i)   => setData(d => ({ ...d, [f]: d[f].filter((_, x) => x !== i) }));

  const sumArr = (arr) => arr.reduce((s, r) => s + (parseFloat(r.kwota) || 0), 0).toFixed(2);
  const sumWyd = (arr) => arr.reduce((s, r) => s + (parseFloat(r.wartosc) || 0), 0).toFixed(2);

  // Walidacja
  const validate = (s) => {
    const e = {};
    if (s === 0) {
      if (!data.imie_nazwisko.trim()) e.imie_nazwisko = "Wymagane";
      if (!data.email.includes("@")) e.email = "Podaj poprawny email";
    }
    if (s === 1) {
      if (!data.pkd1_kod.trim()) e.pkd1_kod = "Wymagane";
      if (!data.kwota) e.kwota = "Wymagane";
    }
    if (s === 2) {
      if (data.opis_biznesu.trim().length < 30) e.opis_biznesu = "Opisz działalność (minimum kilka zdań)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep(s => s + 1);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const prev = () => {
    setStep(s => s - 1);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Płatność HotPay ──────────────────────────────────────
  const handlePayment = () => {
    if (!regulamin || !rodo) return;
    localStorage.setItem("pup_order_data", JSON.stringify(data));
    const form = document.createElement("form");
    form.method = "POST";
    form.action = CONFIG.HOTPAY_URL;
    const fields = {
      SEKRET: CONFIG.HOTPAY_SEKRET,
      KWOTA: cena.kwota,                              // ← dynamiczna kwota
      NAZWA_USLUGI: "Generator wniosku PUP – Wnioski24.pl",
      ADRES_WWW: CONFIG.RETURN_URL,
      ID_ZAMOWIENIA: `PUP-${Date.now()}`,
      EMAIL: data.email,
      TELEFON: data.telefon,
      DANE_OSOBOWE: data.imie_nazwisko,
      ADRES_WWW_BLAD: CONFIG.FAILURE_URL,
    };
    Object.entries(fields).forEach(([k, v]) => {
      const inp = document.createElement("input");
      inp.type = "hidden"; inp.name = k; inp.value = v;
      form.appendChild(inp);
    });
    document.body.appendChild(form);
    form.submit();
  };

  // ── Etapy generowania (wizualne + czasowe) ───────────────
  const GEN_STAGES = [
    "🔍 Analiza danych i profilu działalności...",
    "✍️ Uzupełnianie brakujących sekcji wniosku...",
    "📊 Generowanie SWOT, planu finansowego i konkurencji...",
    "📄 Pisanie finalnych treści i budowanie dokumentu DOCX...",
    "📧 Wysyłka na Twój adres e-mail...",
  ];
  // Czas trwania każdego etapu (ms) – łącznie ~7 min
  const STAGE_DURATIONS = [60000, 90000, 90000, 120000, 60000];

  // ── 2-ETAPOWE GENEROWANIE ───────────────────────────────
  async function runGeneration(formData) {
    setStatus("generating");
    setGenStep(0);
    setGenStage(GEN_STAGES[0]);

    // Uruchom timer wizualny niezależnie od API
    let currentStage = 0;
    const advanceStage = () => {
      currentStage++;
      if (currentStage < GEN_STAGES.length) {
        setGenStep(currentStage);
        setGenStage(GEN_STAGES[currentStage]);
        setTimeout(advanceStage, STAGE_DURATIONS[currentStage]);
      }
    };
    setTimeout(advanceStage, STAGE_DURATIONS[0]);

    try {
      const enriched = await claudeEnrich(formData);
      const ai       = await claudeWrite(formData, enriched);

      await fetch(CONFIG.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formularz: formData,
          ai_tresc: ai,
          enriched,
          meta: {
            timestamp: new Date().toISOString(),
            order_id: `PUP-${Date.now()}`,
            email_klienta: formData.email,
            imie_nazwisko: formData.imie_nazwisko,
            kwota_wnioskowana: formData.kwota,
            pkd: `${formData.pkd1_kod} – ${formData.pkd1_nazwa}`,
            miejscowosc: formData.miejscowosc,
            suma_wydatkow: sumWyd(formData.wydatki_dotacja),
          },
        }),
      });

      localStorage.removeItem("pup_order_data");
      setGenStep(4);
      setGenStage(GEN_STAGES[4]);
      setTimeout(() => setStatus("done"), 2000);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  // ── ETAP 1: Uzupełnianie braków + opodatkowanie + 12M plan ─
  async function claudeEnrich(f) {
    const miasto = f.miejscowosc || "w Polsce";
    const maFinanse = !f.finanse_skip && f.przychody.some(r => r.kwota);
    const przychodBaza = maFinanse
      ? f.przychody.reduce((s, r) => s + (parseFloat(r.kwota) || 0), 0)
      : null;

    const prompt = `Jesteś ekspertem od wniosków o dotacje z Urzędu Pracy (PUP) w Polsce
oraz doradcą podatkowym dla małych firm.

WAŻNE ZASADY:
- NIE używaj nazw konkretnych miast ani urzędów pracy w treściach wniosku
- Konkurentów dobierz z okolicy: ${miasto} – podaj realne, istniejące firmy
- Dane branżowe dotyczą całej Polski, nie konkretnego miasta
- Pisz w pierwszej osobie liczby pojedynczej

DANE OD KLIENTA:
PKD: ${f.pkd1_kod} – ${f.pkd1_nazwa}
${f.pkd2_kod ? `PKD poboczne: ${f.pkd2_kod} – ${f.pkd2_nazwa}` : ""}
Kwota dotacji: ${f.kwota} zł
Termin: ${f.termin_podjecia || "nie podano"}
Opis: ${f.opis_biznesu}
Branża: ${f.branza || "nie podano"}
Miejscowość: ${miasto}
Lokal: ${f.adres_dzialalnosci || "praca zdalna"} (${f.status_lokalu || ""})
Klienci: ${f.klienci_skip ? "wygeneruj" : `${f.grupy_klientow} | ${f.sposob_pozyskania}`}
Przychód bazowy (mies.): ${przychodBaza ? przychodBaza + " zł" : "wygeneruj realistyczny dla tej branży"}
Koszty stałe: ${f.finanse_skip ? "wygeneruj" : f.koszty_stale?.map(r => `${r.nazwa} ${r.kwota}zł`).join(", ") || "wygeneruj"}
SWOT: ${f.swot_skip ? "wygeneruj" : `mocne: ${f.mocne.filter(Boolean).join(", ")}`}
Konkurencja: ${f.konkurencja_skip ? `wygeneruj 3 firmy z ${miasto}` : f.konkurencja.filter(k => k.nazwa).map(k => k.nazwa).join(", ") || `wygeneruj 3 firmy z ${miasto}`}
Plan działań: ${f.plan_skip ? "wygeneruj" : f.plan_dzialan.filter(p => p.dzialanie).map(p => p.dzialanie).join(", ") || "wygeneruj"}
Zatrudnienie: ${f.zatrudnienie === "tak" ? f.zatrudnienie_szczegoly : "jednoosobowo"}
Dodatkowe: ${f.dodatkowe_info || "brak"}

ZADANIE 1 – DOBÓR FORMY OPODATKOWANIA:
Na podstawie PKD ${f.pkd1_kod} (${f.pkd1_nazwa}) dobierz najkorzystniejszą formę opodatkowania.
Zasady doboru:
- Ryczałt ewidencjonowany: handel (PKD 45-47) 3%, gastronomia (PKD 56) 3%, IT/programowanie (PKD 62.01) 12%, usługi różne 8,5%, wolne zawody 17%
- Podatek liniowy 19%: opłacalny gdy koszty > 50% przychodu i przychody > 150 000 zł/rok
- Skala podatkowa 12%/32%: gdy dochód roczny < 120 000 zł i duże koszty
- Uwzględnij składkę zdrowotną: ryczałt – ryczałtowa, liniowy – 4,9% dochodu, skala – 9% dochodu
- ZUS preferencyjny przez pierwsze 24 miesiące: ~330 zł (bez chorobowego), po 24 mies. pełny ~1600 zł
- NFZ: zależy od formy, przy ryczałcie – stała kwota ok. 381–572 zł

ZADANIE 2 – PLAN FINANSOWY 12 MIESIĘCY:
Wygeneruj realistyczny plan z WZROSTEM co kwartał (Q2 +15%, Q3 +32%, Q4 +52% vs Q1).
Każdy miesiąc zawiera: 2-3 źródła przychodów, koszty stałe, koszty zmienne, podatek, ZUS+NFZ, dochód netto.
${przychodBaza ? `Baza przychodów Q1: ${przychodBaza} zł/mies. (podane przez klienta)` : "Dobierz realistyczną bazę dla tej branży i miejscowości."}

ZADANIE 3 – TREŚCI MERYTORYCZNE (uzupełnij brakujące):
Wygeneruj brakujące sekcje opisowe wniosku.

Odpowiedz TYLKO jako JSON (zero markdown, zero backtick-ów):
{
  "opodatkowanie": {
    "forma": "nazwa formy np. Ryczałt ewidencjonowany",
    "stawka": "np. 8,5%",
    "podstawa": "przychód lub dochód",
    "zus_miesiac": 330,
    "nfz_miesiac": 381,
    "uzasadnienie": "3-4 zdania dlaczego ta forma jest najlepsza dla tej branży i PKD"
  },
  "plan_12m": [
    {
      "miesiac": 1,
      "nazwa_miesiaca": "Styczeń",
      "przychody": [
        {"nazwa": "źródło 1", "kwota": 0},
        {"nazwa": "źródło 2", "kwota": 0}
      ],
      "suma_przychodow": 0,
      "koszty_stale": 0,
      "koszty_zmienne": 0,
      "podatek": 0,
      "zus_nfz": 0,
      "dochod_netto": 0
    }
  ],
  "cel_przedsiewziecia": "2 zdania",
  "motywacja": "2-3 zdania",
  "opis_glownej": "3-4 zdania",
  "opis_pobocznej": "2 zdania lub pusty string",
  "zrodlo_pomyslu": "2 zdania",
  "plany_rozwoju": "3 zdania",
  "termin_podjecia": "miesiąc rok",
  "branza_opis": "3-4 zdania z liczbami",
  "grupy_klientow": "2-3 zdania",
  "charakterystyka_klientow": "2-3 zdania",
  "popyt_uzasadnienie": "2-3 zdania",
  "sposob_pozyskania": "2-3 zdania",
  "metody_utrzymania": "2 zdania",
  "lokalizacja_opis": "2-3 zdania",
  "sposob_zarzadzania": "2-3 zdania",
  "dostawcy": "2-3 zdania",
  "roznice_konkurencja": "3 zdania",
  "swot_mocne": ["p1","p2","p3","p4","p5"],
  "swot_slabe": ["p1","p2","p3"],
  "swot_szanse": ["p1","p2","p3","p4"],
  "swot_zagrozenia": ["p1","p2","p3"],
  "konkurencja_3": [
    {"nazwa": "firma z ${miasto}","adres": "miasto","opis": "zakres"},
    {"nazwa": "firma z ${miasto}","adres": "miasto","opis": "zakres"},
    {"nazwa": "firma z ${miasto}","adres": "miasto","opis": "zakres"}
  ],
  "plan_dzialan_tabela": [
    {"termin": "mies. rok","dzialanie": "opis","efekt": "efekt"},
    {"termin": "mies. rok","dzialanie": "opis","efekt": "efekt"},
    {"termin": "mies. rok","dzialanie": "opis","efekt": "efekt"},
    {"termin": "mies. rok","dzialanie": "opis","efekt": "efekt"},
    {"termin": "mies. rok","dzialanie": "opis","efekt": "efekt"}
  ],
  "uzasadnienie_finansowe": "4 zdania uzasadniające prognozy i wzrost"
}`;

    const res  = await fetch("https://wnioski24-docx-server.onrender.com/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const raw  = data.content.map(i => i.text || "").join("");
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  }

  // ── ETAP 2: Profesjonalne treści ─────────────────────────
  async function claudeWrite(f, enriched) {
    const miasto = f.miejscowosc || "w Polsce";
    const opod = enriched.opodatkowanie || {};
    const prompt = `Jesteś doświadczonym konsultantem biznesowym piszącym wnioski o dofinansowanie
z Urzędu Pracy w Polsce. Napisz PROFESJONALNE, ROZBUDOWANE i PRZEKONUJĄCE treści.

KLUCZOWE ZASADY:
- NIE wymieniaj żadnej konkretnej nazwy urzędu pracy ani miasta w treściach
- Pisz ogólnie: "lokalny rynek", "okolica", "region"
- Każda sekcja: min. 4-5 zdań, formalny język, pierwsza osoba l. poj.
- Kontekst rynkowy: ${miasto}

DANE BAZOWE:
PKD: ${f.pkd1_kod} – ${f.pkd1_nazwa}
Kwota dotacji: ${f.kwota} zł
Opis klienta: ${f.opis_biznesu}
Forma opodatkowania: ${opod.forma || "ryczałt"} (${opod.stawka || ""})
Uzasadnienie opodatkowania: ${opod.uzasadnienie || ""}

DANE Z ETAPU 1:
${JSON.stringify(enriched, null, 2)}

Odpowiedz TYLKO jako JSON (zero markdown):
{
  "s1_cel": "min. 4 zdania – cel i uzasadnienie",
  "s1_motywacja": "min. 4 zdania – motywacja zawodowa i osobista",
  "s1_plany": "min. 4 zdania – plany rozwoju na 3 lata z konkretnymi celami",
  "s1_opis_glownej": "min. 5 zdań – szczegółowy opis działalności",
  "s1_opis_pobocznej": "min. 3 zdania lub pusty string",
  "s1_zrodlo": "min. 3 zdania – źródło pomysłu",
  "s1_rynek": "min. 5 zdań – analiza rynku z danymi ogólnopolskimi",
  "s1_branza": "min. 5 zdań – opis branży z liczbami",
  "s1_roznice": "min. 4 zdania – wyróżniki na tle konkurencji",
  "s1_przewaga": "min. 3 zdania – przewaga konkurencji i plan minimalizacji",
  "s2_grupy": "min. 3 zdania – grupy klientów",
  "s2_charakterystyka": "min. 3 zdania – charakterystyka klientów",
  "s2_popyt": "min. 3 zdania – uzasadnienie popytu",
  "s2_pozyskanie": "min. 4 zdania – strategia pozyskania klientów",
  "s2_utrzymanie": "min. 3 zdania – metody utrzymania klientów",
  "s3_lokalizacja": "min. 3 zdania – opis lokalizacji",
  "s3_plusy_minusy": "min. 3 zdania – plusy i minusy",
  "s3_wplyw": "min. 3 zdania – wpływ lokalizacji na biznes",
  "s4_zarzadzanie": "min. 3 zdania – sposób zarządzania",
  "s4_dostawcy": "min. 3 zdania – dostawcy i współpraca",
  "plan_dzialan_opis": "min. 2 zdania – wprowadzenie do harmonogramu",
  "opodatkowanie_uzasadnienie": "min. 4 zdania – dlaczego wybrana forma opodatkowania jest najkorzystniejsza, uwzględnij składkę zdrowotną i ZUS",
  "finanse_uzasadnienie": "min. 4 zdania – uzasadnienie prognoz z uwzględnieniem wzrostu 15% co kwartał i wybranej formy opodatkowania",
  "wydatki_uzasadnienie": "min. 3 zdania – uzasadnienie całości wydatków z dotacji"
}`;

    const res  = await fetch("https://wnioski24-docx-server.onrender.com/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const resp = await res.json();
    const raw  = resp.content.map(i => i.text || "").join("");
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  }

  // ── Render ────────────────────────────────────────────────
  if (status === "generating") return <StatusScreen type="generating" stage={genStage} genStep={genStep} />;
  if (status === "done")       return <StatusScreen type="done" email={data.email} />;
  if (status === "error")      return <StatusScreen type="error" onRetry={() => setStatus("form")} />;

  return (
    <div style={S.app} ref={topRef}>
      <style>{CSS}</style>
      <Header />
      <Stepper step={step} steps={STEPS} />

      <div style={S.content}>
        <div style={S.card}>
          {step === 0 && <StepKontakt     data={data} set={set} errors={errors} />}
          {step === 1 && <StepDzialalnosc data={data} set={set} errors={errors} />}
          {step === 2 && <StepOpis        data={data} set={set} errors={errors} />}
          {step === 3 && <StepKlienci     data={data} set={set} />}
          {step === 4 && <StepLokalizacja data={data} set={set} />}
          {step === 5 && <StepFinanse     data={data} set={set} setArr={setArr} addRow={addRow} remRow={remRow} sumArr={sumArr} />}
          {step === 6 && <StepWydatki     data={data} setArr={setArr} addRow={addRow} remRow={remRow} sumWyd={sumWyd} />}
          {step === 7 && <StepDodatkowe   data={data} set={set} setArr={setArr} addRow={addRow} remRow={remRow} />}
          {step === 8 && (
            <StepZamowienie
              data={data} sumWyd={sumWyd}
              regulamin={regulamin} setRegulamin={setRegulamin}
              rodo={rodo} setRodo={setRodo}
              marketing={marketing} setMarketing={setMarketing}
              onPay={handlePayment}
              cena={cena}
            />
          )}
        </div>

        {step < 8 && (
          <div style={S.nav}>
            {step > 0
              ? <button style={S.btnBack} onClick={prev}>← Wstecz</button>
              : <div />
            }
            <button style={S.btnNext} onClick={next}>
              {step === 7 ? "Przejdź do zamówienia →" : "Dalej →"}
            </button>
          </div>
        )}
      </div>

      <footer style={S.footer}>
        © 2025 Wnioski24.pl ·{" "}
        <a href={CONFIG.REGULAMIN_URL} style={S.flink}>Regulamin</a> ·{" "}
        <a href={CONFIG.POLITYKA_URL}  style={S.flink}>Polityka prywatności</a>
      </footer>
    </div>
  );
}

// ============================================================
// KROKI FORMULARZA
// ============================================================

function StepKontakt({ data, set, errors }) {
  return (
    <Wrap title="Twoje dane kontaktowe"
      desc="Na podany adres email wyślemy gotowy wniosek w formacie DOCX.">
      <Field label="Imię i nazwisko *" error={errors.imie_nazwisko}>
        <input style={inp(errors.imie_nazwisko)} value={data.imie_nazwisko}
          onChange={e => set("imie_nazwisko", e.target.value)} placeholder="Jan Kowalski" />
      </Field>
      <Field label="Adres e-mail *" error={errors.email}>
        <input style={inp(errors.email)} type="email" value={data.email}
          onChange={e => set("email", e.target.value)} placeholder="jan@firma.pl" />
      </Field>
      <Field label="Telefon kontaktowy">
        <input style={inp()} value={data.telefon}
          onChange={e => set("telefon", e.target.value)} placeholder="600 000 000" />
      </Field>
      <InfoBox>
        📧 Gotowy wniosek (plik DOCX z wszystkimi załącznikami) wyślemy na ten email
        w ciągu kilku minut od zaksięgowania płatności.
      </InfoBox>
    </Wrap>
  );
}

function StepDzialalnosc({ data, set, errors }) {
  return (
    <Wrap title="Podstawy działalności"
      desc="Podaj kody PKD i kwotę dotacji. Resztę uzupełni narzędzie.">
      <AIBadge text="Narzędzie uzupełni opis każdego PKD i dane branżowe automatycznie" />
      <div style={g2}>
        <Field label="Kod PKD główny * (np. 62.01.Z)" error={errors.pkd1_kod}>
          <input style={inp(errors.pkd1_kod)} value={data.pkd1_kod}
            onChange={e => set("pkd1_kod", e.target.value)} placeholder="62.01.Z" />
        </Field>
        <Field label="Nazwa działalności głównej">
          <input style={inp()} value={data.pkd1_nazwa}
            onChange={e => set("pkd1_nazwa", e.target.value)}
            placeholder="np. Działalność związana z oprogramowaniem" />
        </Field>
      </div>
      <div style={g2}>
        <Field label="Kod PKD poboczny (opcjonalnie)">
          <input style={inp()} value={data.pkd2_kod}
            onChange={e => set("pkd2_kod", e.target.value)} placeholder="73.11.Z" />
        </Field>
        <Field label="Nazwa działalności pobocznej">
          <input style={inp()} value={data.pkd2_nazwa}
            onChange={e => set("pkd2_nazwa", e.target.value)} placeholder="np. Agencja reklamowa" />
        </Field>
      </div>
      <div style={g2}>
        <Field label="Wnioskowana kwota dotacji (zł) *" error={errors.kwota}>
          <input style={inp(errors.kwota)} type="number" value={data.kwota}
            onChange={e => set("kwota", e.target.value)} placeholder="28000" />
        </Field>
        <Field label="Kwota słownie (opcjonalnie)">
          <input style={inp()} value={data.kwota_slownie}
            onChange={e => set("kwota_slownie", e.target.value)}
            placeholder="dwadzieścia osiem tysięcy złotych" />
        </Field>
      </div>
      <Field label="Planowany termin podjęcia działalności">
        <input style={inp()} value={data.termin_podjecia}
          onChange={e => set("termin_podjecia", e.target.value)}
          placeholder="np. luty 2026" />
      </Field>
      <InfoBox>
        💡 Maksymalna kwota dotacji z PUP to zazwyczaj ok. 28 000 – 42 000 zł
        (6× przeciętne wynagrodzenie). Kwota musi zgadzać się z listą wydatków (ostatni krok).
      </InfoBox>
    </Wrap>
  );
}

function StepOpis({ data, set, errors }) {
  return (
    <Wrap title="Opisz swój biznes"
      desc="To najważniejsze pole. Napisz o swojej działalności – nasz system zbuduje z tego pełny, profesjonalny wniosek.">
      <AIBadge text="System rozbuduje ten opis w kilkanaście sekcji wniosku, uzupełni dane rynkowe, analizę konkurencji i uzasadnienia" />
      <Field
        label="Opisz planowaną działalność *"
        hint="Napisz co będziesz robić, dla kogo, dlaczego, jakie masz doświadczenie, co Cię wyróżnia. Im więcej napiszesz – tym lepszy wniosek."
        error={errors.opis_biznesu}
      >
        <textarea style={{ ...inp(errors.opis_biznesu), resize: "vertical", lineHeight: 1.7 }}
          rows={8} value={data.opis_biznesu}
          onChange={e => set("opis_biznesu", e.target.value)}
          placeholder={`Przykład: Planuję otworzyć firmę zajmującą się tworzeniem stron internetowych i sklepów online dla małych firm z branży gastronomicznej i usługowej. Przez ostatnie 5 lat pracowałem jako freelancer robiąc strony dla znajomych i małych lokalnych firm. Widzę duże zapotrzebowanie – większość małych restauracji i salonów nie ma porządnych stron. Chcę oferować kompleksowe usługi: projekt, wykonanie, hosting i opiekę. Moją przewagą jest specjalizacja w konkretnej niszy i szybki czas realizacji (do 2 tygodni). Planuję w ciągu roku zdobyć 10 stałych klientów i zatrudnić grafika.`}
        />
      </Field>
      <div style={g2}>
        <Field label="Branża / słowa kluczowe (opcjonalnie)"
          hint="Pomaga dobrać odpowiednie dane rynkowe">
          <input style={inp()} value={data.branza}
            onChange={e => set("branza", e.target.value)}
            placeholder="np. IT, web design, gastronomia, budownictwo..." />
        </Field>
        <Field label="Wymagane uprawnienia / licencje?">
          <select style={sel()} value={data.uprawnienia_wymagane}
            onChange={e => set("uprawnienia_wymagane", e.target.value)}>
            <option value="nie">Nie są wymagane</option>
            <option value="tak">Tak – posiadam wymagane</option>
          </select>
        </Field>
      </div>
      {data.uprawnienia_wymagane === "tak" && (
        <Field label="Jakie uprawnienia posiadasz?">
          <input style={inp()} value={data.uprawnienia_opis}
            onChange={e => set("uprawnienia_opis", e.target.value)}
            placeholder="Certyfikat, dyplom, licencja..." />
        </Field>
      )}
    </Wrap>
  );
}

function StepKlienci({ data, set }) {
  return (
    <Wrap title="Twoi klienci" desc="Opcjonalne – narzędzie opisze klientów na podstawie Twojego biznesu jeśli pominiesz.">
      <SkipToggle
        skipped={data.klienci_skip}
        onSkip={() => set("klienci_skip", true)}
        onFill={() => set("klienci_skip", false)}
        skipLabel="Pomiń – system opisze klientów automatycznie"
        fillLabel="Chcę opisać sam/a"
      />
      {!data.klienci_skip && (
        <>
          <AIBadge text="Podane informacje zostaną rozbudowane i uzupełnione przez narzędzie" />
          <Field label="Do kogo kierujesz ofertę?" hint="Główne grupy klientów">
            <textarea style={{ ...inp(), resize: "vertical" }} rows={3}
              value={data.grupy_klientow}
              onChange={e => set("grupy_klientow", e.target.value)}
              placeholder="np. Małe firmy 5-20 osób z branży usługowej, właściciele restauracji..." />
          </Field>
          <Field label="Jak planujesz pozyskiwać klientów?">
            <textarea style={{ ...inp(), resize: "vertical" }} rows={3}
              value={data.sposob_pozyskania}
              onChange={e => set("sposob_pozyskania", e.target.value)}
              placeholder="np. Media społecznościowe, polecenia, Google Ads, networking..." />
          </Field>
        </>
      )}
    </Wrap>
  );
}

function StepLokalizacja({ data, set }) {
  return (
    <Wrap title="Lokalizacja działalności" desc="Wskaż gdzie będziesz prowadzić działalność.">

      <Field label="Miejscowość prowadzenia działalności *"
        hint="Na podstawie tej miejscowości dobierzemy lokalnych konkurentów do wniosku">
        <input style={inp()} value={data.miejscowosc}
          onChange={e => set("miejscowosc", e.target.value)}
          placeholder="np. Kraków, Gdańsk, Poznań, Wrocław..." />
      </Field>

      <div style={{ marginBottom: 18 }}>
        <label style={S.checkLabel}>
          <CheckBox checked={data.praca_zdalna} onChange={v => set("praca_zdalna", v)} />
          <span style={{ fontSize: 14 }}>
            <strong>Działalność prowadzona zdalnie / online</strong>
            <span style={{ color: "#6b7280", marginLeft: 6 }}>(adres zamieszkania jako siedziba firmy)</span>
          </span>
        </label>
      </div>

      {!data.praca_zdalna && (
        <Field label="Pełny adres miejsca wykonywania działalności">
          <input style={inp()} value={data.adres_dzialalnosci}
            onChange={e => set("adres_dzialalnosci", e.target.value)}
            placeholder="ul. Przykładowa 1/2, 00-001 Miejscowość" />
        </Field>
      )}

      <div style={g2}>
        <Field label="Status prawny lokalu">
          <select style={sel()} value={data.status_lokalu}
            onChange={e => set("status_lokalu", e.target.value)}>
            <option value="">Wybierz...</option>
            <option value="własność">Własność</option>
            <option value="najem">Najem (umowa najmu)</option>
            <option value="użyczenie">Użyczenie</option>
            <option value="wirtualne biuro">Wirtualne biuro</option>
            <option value="adres zamieszkania">Adres zamieszkania</option>
          </select>
        </Field>
        <Field label="Powierzchnia i stan techniczny (opcjonalnie)">
          <input style={inp()} value={data.powierzchnia_stan}
            onChange={e => set("powierzchnia_stan", e.target.value)}
            placeholder="np. 20 m², dobry stan, po remoncie" />
        </Field>
      </div>

      <InfoBox>
        {data.praca_zdalna
          ? "✅ Przy pracy zdalnej jako adres działalności wpisuje się adres zamieszkania. Narzędzie opisze lokalizację odpowiednio do tego modelu."
          : "📍 Lokal musi znajdować się na terenie działania właściwego Urzędu Pracy."}
      </InfoBox>
    </Wrap>
  );
}

function StepFinanse({ data, set, setArr, addRow, remRow, sumArr }) {
  const dochod = (
    parseFloat(sumArr(data.przychody)) -
    parseFloat(sumArr(data.koszty_stale)) -
    parseFloat(sumArr(data.koszty_zmienne))
  ).toFixed(2);

  return (
    <Wrap title="Plan finansowy" desc="Opcjonalne – narzędzie wygeneruje realistyczny plan finansowy dopasowany do Twojej branży.">
      <SkipToggle
        skipped={data.finanse_skip}
        onSkip={() => set("finanse_skip", true)}
        onFill={() => set("finanse_skip", false)}
        skipLabel="Pomiń – system przygotuje plan finansowy automatycznie"
        fillLabel="Chcę wpisać własne liczby"
      />

      {!data.finanse_skip && (
        <>
          <AIBadge text="Narzędzie uzupełni brakujące pozycje i napisze uzasadnienie prognoz" />

          <SubTitle>Planowane przychody miesięczne</SubTitle>
          {data.przychody.map((r, i) => (
            <RowBox key={i}>
              <div style={g2}>
                <input style={inp()} value={r.nazwa}
                  onChange={e => setArr("przychody", i, "nazwa", e.target.value)}
                  placeholder="Źródło przychodu (np. usługi projektowe)" />
                <input style={inp()} type="number" value={r.kwota}
                  onChange={e => setArr("przychody", i, "kwota", e.target.value)}
                  placeholder="Kwota zł/mies." />
              </div>
              {data.przychody.length > 1 &&
                <RemBtn onClick={() => remRow("przychody", i)} />}
            </RowBox>
          ))}
          <AddBtn onClick={() => addRow("przychody", { nazwa: "", kwota: "" })}>
            + Dodaj przychód
          </AddBtn>
          <SumLine label="Suma przychodów" val={sumArr(data.przychody)} />

          <SubTitle>Koszty stałe miesięczne</SubTitle>
          {data.koszty_stale.map((r, i) => (
            <RowBox key={i}>
              <div style={g2}>
                <input style={inp()} value={r.nazwa}
                  onChange={e => setArr("koszty_stale", i, "nazwa", e.target.value)}
                  placeholder="np. ZUS (ok. 1 600 zł), księgowość, czynsz" />
                <input style={inp()} type="number" value={r.kwota}
                  onChange={e => setArr("koszty_stale", i, "kwota", e.target.value)}
                  placeholder="Kwota zł/mies." />
              </div>
              {data.koszty_stale.length > 1 &&
                <RemBtn onClick={() => remRow("koszty_stale", i)} />}
            </RowBox>
          ))}
          <AddBtn onClick={() => addRow("koszty_stale", { nazwa: "", kwota: "" })}>
            + Dodaj koszt stały
          </AddBtn>
          <SumLine label="Suma kosztów stałych" val={sumArr(data.koszty_stale)} />

          <SubTitle>Koszty zmienne miesięczne</SubTitle>
          {data.koszty_zmienne.map((r, i) => (
            <RowBox key={i}>
              <div style={g2}>
                <input style={inp()} value={r.nazwa}
                  onChange={e => setArr("koszty_zmienne", i, "nazwa", e.target.value)}
                  placeholder="np. materiały, reklama, paliwo" />
                <input style={inp()} type="number" value={r.kwota}
                  onChange={e => setArr("koszty_zmienne", i, "kwota", e.target.value)}
                  placeholder="Kwota zł/mies." />
              </div>
              {data.koszty_zmienne.length > 1 &&
                <RemBtn onClick={() => remRow("koszty_zmienne", i)} />}
            </RowBox>
          ))}
          <AddBtn onClick={() => addRow("koszty_zmienne", { nazwa: "", kwota: "" })}>
            + Dodaj koszt zmienny
          </AddBtn>
          <SumLine label="Suma kosztów zmiennych" val={sumArr(data.koszty_zmienne)} />

          <div style={{
            ...S.balanceBox,
            color: parseFloat(dochod) >= 0 ? "#065f46" : "#dc2626"
          }}>
            Szacowany dochód miesięczny: <strong>{dochod} zł</strong>
          </div>

          <Field label="Dodatkowe uzasadnienie prognoz (opcjonalnie)"
            hint="System uzupełni jeśli zostawisz puste">
            <textarea style={{ ...inp(), resize: "vertical" }} rows={3}
              value={data.uzasadnienie_finansowe}
              onChange={e => set("uzasadnienie_finansowe", e.target.value)}
              placeholder="Skąd wzięły się szacunki? Na jakiej podstawie..." />
          </Field>
        </>
      )}
    </Wrap>
  );
}

function StepWydatki({ data, setArr, addRow, remRow, sumWyd }) {
  const total = parseFloat(sumWyd(data.wydatki_dotacja));
  const kwota = parseFloat(data.kwota) || 0;
  const diff  = kwota - total;

  return (
    <Wrap title="Co kupisz za dotację? (Załącznik nr 4)"
      desc="Lista wydatków jest wymagana – musi sumować się do wnioskowanej kwoty.">
      <AIBadge text="Narzędzie uzupełni uzasadnienie każdego wydatku jeśli zostawisz puste" />

      <div style={{ overflowX: "auto" }}>
        <table style={S.tbl}>
          <thead>
            <tr style={{ background: C.navy }}>
              {["Lp.", "Nazwa towaru / usługi *", "Ilość", "Cena jedn.", "Wartość *", "Uzasadnienie (opcjonalnie)"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {data.wydatki_dotacja.map((w, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "white" : "#f8fafc" }}>
                <td style={S.td}>{i + 1}</td>
                <td style={S.td}>
                  <input style={tblInp()} value={w.nazwa}
                    onChange={e => setArr("wydatki_dotacja", i, "nazwa", e.target.value)}
                    placeholder="np. Laptop" />
                </td>
                <td style={S.td}>
                  <input style={{ ...tblInp(), width: 70 }} value={w.ilosc}
                    onChange={e => setArr("wydatki_dotacja", i, "ilosc", e.target.value)}
                    placeholder="1 szt." />
                </td>
                <td style={S.td}>
                  <input style={{ ...tblInp(), width: 80 }} type="number" value={w.cena}
                    onChange={e => {
                      const cena    = e.target.value;
                      const wartosc = (parseFloat(cena) * (parseFloat(w.ilosc) || 1)).toFixed(2);
                      setArr("wydatki_dotacja", i, "cena", cena);
                      setTimeout(() => setArr("wydatki_dotacja", i, "wartosc", wartosc), 0);
                    }}
                    placeholder="0.00" />
                </td>
                <td style={S.td}>
                  <input style={{ ...tblInp(), width: 80 }} type="number" value={w.wartosc}
                    onChange={e => setArr("wydatki_dotacja", i, "wartosc", e.target.value)}
                    placeholder="0.00" />
                </td>
                <td style={S.td}>
                  <input style={tblInp()} value={w.uzasadnienie}
                    onChange={e => setArr("wydatki_dotacja", i, "uzasadnienie", e.target.value)}
                    placeholder="Narzędzie uzupełni..." />
                </td>
                <td style={S.td}>
                  {data.wydatki_dotacja.length > 1 &&
                    <RemBtn onClick={() => remRow("wydatki_dotacja", i)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddBtn onClick={() => addRow("wydatki_dotacja", { nazwa: "", ilosc: "1 szt.", cena: "", wartosc: "", uzasadnienie: "" })}>
        + Dodaj pozycję
      </AddBtn>

      <div style={S.wydatkiSum}>
        <span>Łącznie: <strong style={{ color: Math.abs(diff) < 1 ? "#065f46" : "#dc2626" }}>{total.toFixed(2)} zł</strong></span>
        {data.kwota && Math.abs(diff) >= 1 && (
          <span style={S.diffBadge}>⚠ Różnica: {diff.toFixed(2)} zł względem {data.kwota} zł wnioskowanych</span>
        )}
        {data.kwota && Math.abs(diff) < 1 && (
          <span style={S.okBadge}>✓ Kwoty się zgadzają</span>
        )}
      </div>
    </Wrap>
  );
}

function StepDodatkowe({ data, set, setArr, addRow, remRow }) {
  return (
    <Wrap title="Dane dodatkowe (wszystko opcjonalne)"
      desc="Jeśli masz czas – uzupełnij. Jeśli nie – AI wygeneruje wszystko automatycznie.">

      {/* SWOT */}
      <SectionToggle
        title="Analiza SWOT"
        icon="📊"
        skipped={data.swot_skip}
        onSkip={() => set("swot_skip", true)}
        onFill={() => set("swot_skip", false)}
        skipLabel="Pomiń – system wygeneruje SWOT automatycznie"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {[
            { f: "mocne",     label: "💪 Mocne strony",  color: "#065f46", bg: "#f0fdf4" },
            { f: "slabe",     label: "⚠️ Słabe strony",  color: "#92400e", bg: "#fffbeb" },
            { f: "szanse",    label: "🚀 Szanse",         color: "#1e3a8a", bg: "#eff6ff" },
            { f: "zagrozenia",label: "🛡️ Zagrożenia",    color: "#7f1d1d", bg: "#fef2f2" },
          ].map(({ f, label, color, bg }) => (
            <div key={f} style={{ border: `2px solid ${color}`, borderRadius: 8, padding: 12, background: bg }}>
              <div style={{ fontWeight: 700, color, fontSize: 13, marginBottom: 8 }}>{label}</div>
              {data[f].map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{i + 1}.</span>
                  <input style={{ ...inp(), flex: 1 }} value={v}
                    onChange={e => setArr(f, i, null, e.target.value)}
                    placeholder={`Punkt ${i + 1} (opcjonalnie)...`} />
                  {data[f].length > 1 && <RemBtn onClick={() => remRow(f, i)} />}
                </div>
              ))}
              <button style={{ background: "none", border: "none", color, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                onClick={() => addRow(f, "")}>+ Dodaj</button>
            </div>
          ))}
        </div>
      </SectionToggle>

      {/* Konkurencja */}
      <SectionToggle
        title="Główni konkurenci"
        icon="🏆"
        skipped={data.konkurencja_skip}
        onSkip={() => set("konkurencja_skip", true)}
        onFill={() => set("konkurencja_skip", false)}
        skipLabel="Pomiń – system dobierze konkurentów z Twojej okolicy"
      >
        {data.konkurencja.map((k, i) => (
          <RowBox key={i}>
            <div style={g2}>
              <input style={inp()} value={k.nazwa}
                onChange={e => setArr("konkurencja", i, "nazwa", e.target.value)}
                placeholder="Nazwa firmy" />
              <input style={inp()} value={k.opis}
                onChange={e => setArr("konkurencja", i, "opis", e.target.value)}
                placeholder="Czym się zajmuje" />
            </div>
            {data.konkurencja.length > 1 && <RemBtn onClick={() => remRow("konkurencja", i)} />}
          </RowBox>
        ))}
        <AddBtn onClick={() => addRow("konkurencja", { nazwa: "", opis: "" })}>
          + Dodaj konkurenta
        </AddBtn>
      </SectionToggle>

      {/* Plan działań */}
      <SectionToggle
        title="Plan działań organizacyjnych (Zał. nr 1)"
        icon="📅"
        skipped={data.plan_skip}
        onSkip={() => set("plan_skip", true)}
        onFill={() => set("plan_skip", false)}
        skipLabel="Pomiń – system stworzy harmonogram automatycznie"
      >
        {data.plan_dzialan.map((p, i) => (
          <RowBox key={i}>
            <div style={g2}>
              <input style={inp()} value={p.termin}
                onChange={e => setArr("plan_dzialan", i, "termin", e.target.value)}
                placeholder="Termin (np. styczeń 2026)" />
              <input style={inp()} value={p.dzialanie}
                onChange={e => setArr("plan_dzialan", i, "dzialanie", e.target.value)}
                placeholder="Planowane działanie" />
            </div>
            {data.plan_dzialan.length > 1 && <RemBtn onClick={() => remRow("plan_dzialan", i)} />}
          </RowBox>
        ))}
        <AddBtn onClick={() => addRow("plan_dzialan", { termin: "", dzialanie: "" })}>
          + Dodaj działanie
        </AddBtn>
      </SectionToggle>

      {/* Zatrudnienie */}
      <SectionToggle title="Zatrudnienie pracowników" icon="👷" skipped={false}>
        <div style={g2}>
          <Field label="Czy planujesz zatrudnić pracowników?">
            <select style={sel()} value={data.zatrudnienie}
              onChange={e => set("zatrudnienie", e.target.value)}>
              <option value="nie">Nie – działalność jednoosobowa</option>
              <option value="tak">Tak – planuję zatrudnienie</option>
            </select>
          </Field>
        </div>
        {data.zatrudnienie === "tak" && (
          <Field label="Szczegóły zatrudnienia">
            <textarea style={{ ...inp(), resize: "vertical" }} rows={2}
              value={data.zatrudnienie_szczegoly}
              onChange={e => set("zatrudnienie_szczegoly", e.target.value)}
              placeholder="Rodzaj umowy, wymiar etatu, wynagrodzenie, zakres obowiązków..." />
          </Field>
        )}
      </SectionToggle>

      {/* Dodatkowe informacje */}
      <Field label="Cokolwiek jeszcze chcesz dodać do wniosku? (opcjonalnie)"
        hint="Nagrody, certyfikaty, wyjątkowe osiągnięcia, plany które nie pasowały nigdzie indziej">
        <textarea style={{ ...inp(), resize: "vertical" }} rows={3}
          value={data.dodatkowe_info}
          onChange={e => set("dodatkowe_info", e.target.value)}
          placeholder="Np. posiadam certyfikat Google Ads, wygrałem konkurs na najlepszy startup, mam już 3 zainteresowanych klientów..." />
      </Field>

      <InfoBox>
        🔧 <strong>Podsumowanie:</strong> Wszystkie pominięte sekcje zostaną automatycznie
        wygenerowane przez narzędzie na podstawie opisu biznesu i PKD.
        Wniosek będzie w pełni kompletny niezależnie od tego ile wypełniłeś/aś.
      </InfoBox>
    </Wrap>
  );
}

function StepZamowienie({ data, sumWyd, regulamin, setRegulamin, rodo, setRodo, marketing, setMarketing, onPay, cena }) {
  const canPay = regulamin && rodo;
  const total  = sumWyd(data.wydatki_dotacja);

  return (
    <Wrap title="Podsumowanie zamówienia"
      desc="Sprawdź dane, zaakceptuj regulamin i przejdź do bezpiecznej płatności.">

      <div style={S.orderBox}>
        <div style={S.orderTitle}>📄 Generator wniosku o dotację z Urzędu Pracy</div>
        <div style={{ marginBottom: 16 }}>
          {[
            ["Wnioskodawca",          data.imie_nazwisko || "—"],
            ["Email",                 data.email || "—"],
            ["PKD główne",            data.pkd1_kod ? `${data.pkd1_kod} – ${data.pkd1_nazwa}` : "—"],
            ["Miejscowość",           data.miejscowosc || "—"],
            ["Kwota dotacji",         data.kwota ? `${data.kwota} zł` : "—"],
            ["Suma wydatków (Zał. 4)",`${total} zł`],
            ["Plan finansowy",        data.finanse_skip ? "Generowany przez system" : "Wypełniony własnoręcznie"],
            ["SWOT / plan działań",   data.swot_skip ? "Generowany przez system" : "Wypełniony własnoręcznie"],
          ].map(([k, v]) => (
            <div key={k} style={S.orderRow}>
              <span style={{ color: "#64748b" }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={S.orderTotal}>
          <span>Do zapłaty za usługę:</span>
          <span style={S.orderPrice}>{cena.display}</span>
        </div>
        <div style={S.orderNote}>
          Co otrzymasz: kompletny wniosek + 4 załączniki jako plik DOCX wysłany na {data.email || "Twój email"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        <CheckboxRow checked={regulamin} onChange={setRegulamin} required>
          Zapoznałem/am się i akceptuję{" "}
          <a href={CONFIG.REGULAMIN_URL} target="_blank" rel="noreferrer" style={S.link}>
            Regulamin świadczenia usług
          </a>{" "}serwisu Wnioski24.pl *
        </CheckboxRow>
        <CheckboxRow checked={rodo} onChange={setRodo} required>
          Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji usługi
          zgodnie z{" "}
          <a href={CONFIG.POLITYKA_URL} target="_blank" rel="noreferrer" style={S.link}>
            Polityką Prywatności
          </a> *
        </CheckboxRow>
        <CheckboxRow checked={marketing} onChange={setMarketing}>
          Wyrażam zgodę na otrzymywanie informacji handlowych drogą elektroniczną (opcjonalnie)
        </CheckboxRow>
        <p style={{ fontSize: 11, color: "#94a3b8" }}>* Pola wymagane do złożenia zamówienia.</p>
      </div>

      <button
        style={{ ...S.payBtn, opacity: canPay ? 1 : 0.4, cursor: canPay ? "pointer" : "not-allowed" }}
        onClick={canPay ? onPay : undefined}
      >
        🔒 Zapłać {cena.display} i wygeneruj wniosek
      </button>

      {!canPay && (
        <p style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", marginTop: 8 }}>
          Zaakceptuj regulamin i zgodę RODO aby kontynuować
        </p>
      )}

      <div style={S.secureRow}>
        <span>🛡️ Bezpieczna płatność – HotPay</span>
        <span>·</span>
        <span>🔒 Szyfrowanie SSL</span>
        <span>·</span>
        <span>📧 DOCX na email · czas realizacji 5–10 min</span>
      </div>
    </Wrap>
  );
}

// ============================================================
// EKRANY STATUSU
// ============================================================
function StatusScreen({ type, email, stage, genStep, onRetry }) {
  const STAGES = [
    "Analiza danych i profilu działalności",
    "Uzupełnianie brakujących sekcji wniosku",
    "Generowanie SWOT, planu finansowego i konkurencji",
    "Pisanie finalnych treści i budowanie dokumentu DOCX",
    "Wysyłka na Twój adres e-mail",
  ];

  const MAP = {
    generating: {
      icon: "⚙️", color: C.gold,
      title: "Przygotowujemy Twój wniosek…",
      sub: "Narzędzie analizuje dane i pisze profesjonalne treści. Nie zamykaj tej strony.",
      extra: (
        <div style={{ marginTop: 28, maxWidth: 400, margin: "28px auto 0" }}>
          <div style={S.spinner} />
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            {STAGES.map((s, i) => {
              const done    = i < (genStep || 0);
              const active  = i === (genStep || 0);
              return (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", opacity: i > (genStep || 0) ? 0.4 : 1 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    background: done ? "#065f46" : active ? C.gold : "#e2e8f0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "white", fontWeight: 700,
                    boxShadow: active ? `0 0 0 4px ${C.gold}33` : "none",
                    transition: "all .4s",
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: 13, color: active ? C.navy : "#6b7280", fontWeight: active ? 700 : 400 }}>
                    {s}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 28, background: "#fffbeb", border: `1px solid ${C.gold}`, borderRadius: 8, padding: 14, textAlign: "left" }}>
            <p style={{ fontSize: 13, color: "#92400e", margin: 0 }}>
              ⏱ <strong>Czas oczekiwania: 5–10 minut.</strong> Wniosek jest generowany
              i szczegółowo opracowywany przez nasz system. Po zakończeniu otrzymasz
              plik DOCX na podany adres e-mail – możesz zamknąć tę kartę.
            </p>
          </div>
        </div>
      ),
    },
    done: {
      icon: "✅", color: "#065f46",
      title: "Wniosek gotowy!",
      sub: `Wysłany na adres ${email}`,
      extra: (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            📄 W wiadomości znajdziesz plik <strong>DOCX</strong> z kompletnym wnioskiem
            i wszystkimi załącznikami.<br /><br />
            Pamiętaj, że dane osobowe (PESEL, NIP, adres, nr konta) i podpis
            musisz uzupełnić samodzielnie przed złożeniem w urzędzie.
          </p>
          <a href="https://wnioski24.pl" style={{ ...S.payBtn, display: "inline-block", marginTop: 24, textDecoration: "none", maxWidth: 300 }}>
            ← Wróć do Wnioski24.pl
          </a>
        </div>
      ),
    },
    error: {
      icon: "❌", color: "#dc2626",
      title: "Coś poszło nie tak",
      sub: "Płatność nie powiodła się lub wystąpił problem techniczny",
      extra: (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Skontaktuj się z nami: <strong>kontakt@wnioski24.pl</strong>
          </p>
          <button style={{ ...S.payBtn, background: "#dc2626", marginTop: 16 }} onClick={onRetry}>
            ← Spróbuj ponownie
          </button>
        </div>
      ),
    },
  }[type];

  return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", maxWidth: 500, padding: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{MAP.icon}</div>
        <h2 style={{ color: MAP.color, fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 8 }}>{MAP.title}</h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>{MAP.sub}</p>
        {MAP.extra}
      </div>
    </div>
  );
}

// ============================================================
// KOMPONENTY POMOCNICZE
// ============================================================
function Header() {
  const cena = getCena();
  return (
    <header style={S.header}>
      <div style={S.headerInner}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 26 }}>⚖️</span>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: C.gold, fontWeight: 700 }}>Wnioski24.pl</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>Generator wniosku o dotację z Urzędu Pracy</div>
          </div>
        </div>
        <div style={S.priceBadge}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Cena usługi</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.gold, fontFamily: "'Playfair Display', serif" }}>{cena.display}</div>
        </div>
      </div>
    </header>
  );
}

function Stepper({ step, steps }) {
  return (
    <div style={S.stepperWrap}>
      <div style={S.stepper}>
        {steps.map((s, i) => (
          <div key={s.id} style={S.stepItem}>
            <div style={{
              ...S.stepDot,
              background: i < step ? C.gold : i === step ? C.navy : "#e2e8f0",
              color: i <= step ? "white" : "#94a3b8",
              transform: i === step ? "scale(1.18)" : "scale(1)",
              boxShadow: i === step ? `0 0 0 3px ${C.gold}44` : "none",
            }}>
              {i < step ? "✓" : s.icon}
            </div>
            {i < steps.length - 1 && (
              <div style={{ ...S.stepLine, background: i < step ? C.gold : "#e2e8f0" }} />
            )}
          </div>
        ))}
      </div>
      <div style={S.stepTitle}>{steps[step].icon} {steps[step].label}</div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
        Krok {step + 1} z {steps.length}
        {!steps[step].required && <span style={{ marginLeft: 8, color: C.gold, fontWeight: 600 }}>• część opcjonalna</span>}
      </div>
    </div>
  );
}

function Wrap({ title, desc, children }) {
  return (
    <div>
      <h2 style={S.cardTitle}>{title}</h2>
      {desc && <p style={S.cardDesc}>{desc}</p>}
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={S.label}>{label}</label>
      {hint && <p style={{ fontSize: 12, color: "#64748b", marginBottom: 6, marginTop: 2 }}>{hint}</p>}
      {children}
      {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>⚠ {error}</div>}
    </div>
  );
}

function SubTitle({ children }) {
  return <div style={S.subTitle}>{children}</div>;
}

function InfoBox({ children }) {
  return <div style={S.infoBox}>{children}</div>;
}

function AIBadge({ text }) {
  return (
    <div style={S.aiBadge}>
      <span style={{ fontSize: 16 }}>🔧</span>
      <span style={{ fontSize: 12, color: "#1e3a8a" }}><strong>Narzędzie:</strong> {text}</span>
    </div>
  );
}

function SkipToggle({ skipped, onSkip, onFill, skipLabel, fillLabel }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
      <button
        style={{ ...S.toggleBtn, background: skipped ? C.navy : "white", color: skipped ? "white" : C.navy, borderColor: C.navy }}
        onClick={onSkip}
      >
        🔧 {skipLabel}
      </button>
      <button
        style={{ ...S.toggleBtn, background: !skipped ? C.gold : "white", color: !skipped ? "white" : C.gold, borderColor: C.gold }}
        onClick={onFill}
      >
        ✏️ {fillLabel}
      </button>
    </div>
  );
}

function SectionToggle({ title, icon, skipped, onSkip, onFill, skipLabel, children }) {
  return (
    <div style={S.sectionToggle}>
      <div style={S.sectionToggleHeader}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{icon} {title}</span>
        {onSkip && (
          <button
            style={{ ...S.toggleBtn, padding: "4px 12px", fontSize: 12, background: skipped ? C.navy : "white", color: skipped ? "white" : C.navy, borderColor: C.navy }}
            onClick={skipped ? onFill : onSkip}
          >
            {skipped ? "✏️ Wypełnię sam/a" : `🔧 ${skipLabel}`}
          </button>
        )}
      </div>
      {!skipped && <div style={{ marginTop: 12 }}>{children}</div>}
      {skipped && (
        <div style={{ padding: "10px 0", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>
          ✅ Narzędzie wygeneruje tę sekcję automatycznie na podstawie opisu biznesu
        </div>
      )}
    </div>
  );
}

function RowBox({ children }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#f8fafc", padding: 10, borderRadius: 8, marginBottom: 8, border: "1px solid #e2e8f0" }}>
      {children}
    </div>
  );
}

function AddBtn({ children, onClick }) {
  return (
    <button style={S.addBtn} onClick={onClick}>{children}</button>
  );
}

function RemBtn({ onClick }) {
  return (
    <button style={S.remBtn} onClick={onClick}>✕</button>
  );
}

function SumLine({ label, val }) {
  return (
    <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: C.navy, padding: "6px 0", borderTop: "1px solid #e2e8f0", marginTop: 2 }}>
      {label}: {val} zł/mies.
    </div>
  );
}

function CheckBox({ checked, onChange }) {
  return (
    <div
      style={{ width: 22, height: 22, border: `2px solid ${checked ? C.navy : "#cbd5e1"}`, borderRadius: 5, background: checked ? C.navy : "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all .15s" }}
      onClick={() => onChange(!checked)}
    >
      {checked && <span style={{ color: "white", fontSize: 13, lineHeight: 1 }}>✓</span>}
    </div>
  );
}

function CheckboxRow({ checked, onChange, required, children }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
      <CheckBox checked={checked} onChange={onChange} />
      <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{children}</span>
    </label>
  );
}

// ============================================================
// STYLE
// ============================================================
const C = { navy: "#0d1f35", gold: "#c8922a", cream: "#f4f1eb" };

const inp = (err) => ({
  width: "100%", padding: "10px 12px", border: `1.5px solid ${err ? "#fca5a5" : "#e2e8f0"}`,
  borderRadius: 7, fontSize: 14, fontFamily: "'Lato', sans-serif",
  background: err ? "#fef2f2" : "white", outline: "none",
});
const sel  = ()     => ({ ...inp(), cursor: "pointer" });
const tblInp = ()   => ({ ...inp(), padding: "5px 8px", fontSize: 12 });
const g2   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

const S = {
  app:        { fontFamily: "'Lato', sans-serif", background: C.cream, minHeight: "100vh", color: C.navy },
  header:     { background: C.navy, borderBottom: `3px solid ${C.gold}` },
  headerInner:{ maxWidth: 840, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  priceBadge: { background: "rgba(200,146,42,0.12)", border: `1px solid ${C.gold}`, borderRadius: 8, padding: "6px 14px", textAlign: "center" },
  stepperWrap:{ background: "white", borderBottom: "1px solid #e2e8f0", padding: "14px 20px 10px" },
  stepper:    { display: "flex", alignItems: "center", maxWidth: 840, margin: "0 auto", overflowX: "auto" },
  stepItem:   { display: "flex", alignItems: "center", flexShrink: 0 },
  stepDot:    { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, transition: "all .25s", flexShrink: 0 },
  stepLine:   { width: 20, height: 2, margin: "0 2px", flexShrink: 0, transition: "background .3s" },
  stepTitle:  { textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: C.navy, marginTop: 10 },
  content:    { maxWidth: 840, margin: "0 auto", padding: "24px 20px 40px" },
  card:       { background: "white", borderRadius: 14, boxShadow: "0 2px 20px rgba(13,31,53,0.07)", padding: "32px 36px", marginBottom: 20 },
  cardTitle:  { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: C.navy, borderLeft: `4px solid ${C.gold}`, paddingLeft: 14, margin: "0 0 6px" },
  cardDesc:   { fontSize: 13, color: "#64748b", marginLeft: 18, marginTop: 4 },
  label:      { display: "block", fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 5 },
  subTitle:   { fontWeight: 700, fontSize: 14, color: C.navy, borderBottom: `2px solid ${C.gold}`, paddingBottom: 4, marginTop: 22, marginBottom: 10 },
  infoBox:    { background: "#fffbeb", border: `1px solid ${C.gold}`, borderRadius: 8, padding: 14, fontSize: 13, color: "#78350f", marginTop: 16 },
  aiBadge:    { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#1e3a8a", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 },
  toggleBtn:  { padding: "8px 16px", borderRadius: 8, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Lato', sans-serif", transition: "all .15s" },
  sectionToggle: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 16 },
  sectionToggleHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  addBtn:     { background: "none", border: `1.5px dashed ${C.gold}`, color: C.gold, padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700, marginTop: 4 },
  remBtn:     { background: "#fef2f2", border: "none", color: "#dc2626", padding: "4px 8px", borderRadius: 5, cursor: "pointer", fontSize: 12, flexShrink: 0 },
  balanceBox: { textAlign: "right", fontWeight: 700, fontSize: 15, padding: "10px 0", borderTop: `2px solid ${C.navy}`, marginTop: 8 },
  tbl:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { padding: "8px 10px", textAlign: "left", fontSize: 12, color: "white", fontWeight: 600 },
  td:         { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", verticalAlign: "middle" },
  wydatkiSum: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 10, paddingTop: 10, borderTop: "2px solid #e2e8f0", fontSize: 14 },
  diffBadge:  { fontSize: 12, color: "#dc2626", background: "#fef2f2", padding: "4px 10px", borderRadius: 6 },
  okBadge:    { fontSize: 12, color: "#065f46", background: "#f0fdf4", padding: "4px 10px", borderRadius: 6 },
  orderBox:   { background: "#f8fafc", border: `2px solid ${C.navy}`, borderRadius: 12, padding: 24, marginBottom: 24 },
  orderTitle: { fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 16 },
  orderRow:   { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 },
  orderTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: `2px solid ${C.navy}`, fontWeight: 700, fontSize: 16 },
  orderPrice: { fontFamily: "'Playfair Display', serif", fontSize: 26, color: C.gold },
  orderNote:  { fontSize: 12, color: "#64748b", fontStyle: "italic", marginTop: 8 },
  payBtn:     { width: "100%", background: C.gold, color: "white", border: "none", padding: "16px 24px", borderRadius: 10, fontSize: 17, fontWeight: 700, fontFamily: "'Lato', sans-serif", cursor: "pointer", boxShadow: "0 4px 16px rgba(200,146,42,0.4)", letterSpacing: 0.3 },
  secureRow:  { display: "flex", justifyContent: "center", gap: 10, fontSize: 12, color: "#94a3b8", marginTop: 14 },
  checkLabel: { display: "flex", gap: 12, alignItems: "center", cursor: "pointer" },
  nav:        { display: "flex", justifyContent: "space-between", alignItems: "center" },
  btnBack:    { background: "white", color: C.navy, border: `2px solid ${C.navy}`, padding: "12px 24px", borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Lato', sans-serif" },
  btnNext:    { background: C.navy, color: "white", border: "none", padding: "12px 28px", borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Lato', sans-serif", marginLeft: "auto", boxShadow: "0 4px 12px rgba(13,31,53,0.25)" },
  footer:     { textAlign: "center", padding: 20, fontSize: 12, color: "#94a3b8", borderTop: "1px solid #e2e8f0" },
  flink:      { color: C.gold, textDecoration: "none" },
  link:       { color: C.gold, textDecoration: "underline" },
  spinner:    { width: 40, height: 40, border: "4px solid #e2e8f0", borderTop: `4px solid ${C.gold}`, borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  input:focus, textarea:focus, select:focus { border-color: #c8922a !important; box-shadow: 0 0 0 3px rgba(200,146,42,0.12) !important; outline: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) {
    div[style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
    div[style*="padding: 32px 36px"] { padding: 20px 16px !important; }
    div[style*="padding: 24px 20px"] { padding: 16px 12px !important; }
  }
`;
