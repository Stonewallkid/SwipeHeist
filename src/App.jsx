import { useState, useEffect, useRef } from "react";
import "./App.css";

const CARD_SHARE = 0.72;
const AVG_PROCESSING_FEE_PERCENT = 0.0275;
const AVG_PROCESSING_FEE_FIXED = 0.05;
const AVG_TRANSACTION_SIZE = 42;
const NATIONAL_SPENDING_RATIO = 0.65;
const AVG_HOUSEHOLD_SIZE = 2.53;

// State abbreviation to FIPS code mapping
const STATE_FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09",
  DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31",
  NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46",
  TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56"
};

const STATE_ABBR_LIST = Object.keys(STATE_FIPS);

function formatFullMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const startTime = performance.now();
    const startValue = display;
    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(startValue + (value - startValue) * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <>{formatFullMoney(display)}</>;
}

function getDailySpend(medianIncome) {
  if (!medianIncome || medianIncome <= 0) return 75;
  return (medianIncome * NATIONAL_SPENDING_RATIO) / AVG_HOUSEHOLD_SIZE / 365;
}

// Fetch all places in a state from Census API
async function fetchStatePlaces(stateAbbr) {
  const fips = STATE_FIPS[stateAbbr];
  if (!fips) throw new Error("Invalid state");

  const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=place:*&in=state:${fips}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Census API error: ${response.status}`);
  }

  const data = await response.json();
  // First row is headers: ["NAME","B01003_001E","B19013_001E","state","place"]
  const [, ...rows] = data;

  return rows.map(([name, pop, income]) => ({
    fullName: name,
    // Extract just the city name (before the comma or state reference)
    name: name.split(",")[0].replace(/ (city|town|CDP|village|borough)$/i, "").trim(),
    population: parseInt(pop) || 0,
    medianIncome: parseInt(income) > 0 ? parseInt(income) : null,
  })).filter(p => p.population > 0);
}

function TownCard({ town, onRemove }) {
  const dailySpend = getDailySpend(town.medianIncome);
  const totalCardVolume = town.population * dailySpend * CARD_SHARE;
  const transactions = Math.round(totalCardVolume / AVG_TRANSACTION_SIZE);
  const percentageFees = totalCardVolume * AVG_PROCESSING_FEE_PERCENT;
  const fixedFees = transactions * AVG_PROCESSING_FEE_FIXED;
  const daily = percentageFees + fixedFees;
  const weekly = daily * 7;
  const monthly = daily * 30;
  const yearly = daily * 365;

  return (
    <div className="town-card">
      <div className="card-glow" />

      <div className="card-header">
        <div>
          <h3 className="town-name">{town.name}</h3>
          <p className="town-meta">
            Pop. {town.population.toLocaleString()} · {town.state}
          </p>
        </div>
        <button className="remove-btn" onClick={onRemove}>×</button>
      </div>

      <div className="data-badges">
        {town.medianIncome && (
          <span className="badge">
            Median HHI: ${town.medianIncome.toLocaleString()}
          </span>
        )}
        <span className="badge">
          ${dailySpend.toFixed(0)}/person/day
        </span>
        <span className={`badge ${town.manual ? "badge-manual" : "badge-census"}`}>
          {town.manual ? "Manual Entry" : "Census Data"}
        </span>
      </div>

      <div className="drain-grid">
        {[
          { label: "Daily drain", value: daily, highlight: true },
          { label: "Weekly drain", value: weekly },
          { label: "Monthly drain", value: monthly },
          { label: "Yearly drain", value: yearly, highlight: true },
        ].map(item => (
          <div key={item.label} className={`drain-cell ${item.highlight ? "highlight" : ""}`}>
            <div className="drain-label">{item.label}</div>
            <div className={`drain-value ${item.highlight ? "highlight" : ""}`}>
              <AnimatedNumber value={item.value} />
            </div>
          </div>
        ))}
      </div>

      <div className="volume-bar">
        <div className="volume-info">
          <span>Daily card volume: {formatFullMoney(totalCardVolume)}</span>
          <span className="fee-rate">{(AVG_PROCESSING_FEE_PERCENT * 100).toFixed(2)}% + ${AVG_PROCESSING_FEE_FIXED.toFixed(2)} → processors</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${AVG_PROCESSING_FEE_PERCENT * 100 * 4}%` }} />
        </div>
      </div>

      <div className="card-footer">
        <span>~{transactions.toLocaleString()} card txns/day</span>
        <span className="per-person-fee">
          {formatFullMoney(yearly / town.population)}/person/yr in fees
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [towns, setTowns] = useState([]);
  const [stateAbbr, setStateAbbr] = useState("CA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statePlaces, setStatePlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPop, setManualPop] = useState("");
  const [manualIncome, setManualIncome] = useState("");

  // Load places when state changes
  useEffect(() => {
    setPlacesLoading(true);
    setStatePlaces([]);
    setError("");

    fetchStatePlaces(stateAbbr)
      .then(places => {
        setStatePlaces(places);
        setPlacesLoading(false);
      })
      .catch(err => {
        setError(`Failed to load ${stateAbbr} places: ${err.message}`);
        setPlacesLoading(false);
      });
  }, [stateAbbr]);

  // Filter places by search term
  const filteredPlaces = searchTerm.trim()
    ? statePlaces.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.fullName.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 10)
    : [];

  const addTown = (place) => {
    const key = `${place.name}-${stateAbbr}`.toLowerCase();
    if (towns.find(t => `${t.name}-${t.state}`.toLowerCase() === key)) {
      setError("Already added!");
      return;
    }
    setTowns(prev => [...prev, {
      name: place.name,
      state: stateAbbr,
      population: place.population,
      medianIncome: place.medianIncome,
      manual: false,
      id: Date.now(),
    }]);
    setSearchTerm("");
    setError("");
  };

  const addManualTown = () => {
    if (!manualName.trim() || !manualPop) return;
    setTowns(prev => [...prev, {
      name: manualName.trim(),
      state: stateAbbr,
      population: parseInt(manualPop),
      medianIncome: manualIncome ? parseInt(manualIncome) : null,
      manual: true,
      id: Date.now(),
    }]);
    setManualName("");
    setManualPop("");
    setManualIncome("");
    setShowManual(false);
    setError("");
  };

  const removeTown = (id) => setTowns(prev => prev.filter(t => t.id !== id));

  const dailyCalc = (t) => {
    const spend = t.population * getDailySpend(t.medianIncome) * CARD_SHARE;
    const txns = Math.round(spend / AVG_TRANSACTION_SIZE);
    return (spend * AVG_PROCESSING_FEE_PERCENT) + (txns * AVG_PROCESSING_FEE_FIXED);
  };
  const totalDaily = towns.reduce((sum, t) => sum + dailyCalc(t), 0);
  const totalYearly = totalDaily * 365;
  const totalPop = towns.reduce((sum, t) => sum + t.population, 0);

  // Famous small towns for quick-add
  const QUICK_TOWNS = [
    { name: "Sedona", state: "AZ" },
    { name: "Aspen", state: "CO" },
    { name: "Key West", state: "FL" },
    { name: "Savannah", state: "GA" },
    { name: "Nantucket", state: "MA" },
    { name: "Carmel-by-the-Sea", state: "CA" },
  ];

  const [quickLoading, setQuickLoading] = useState(null);

  const quickAdd = async (townName, townState) => {
    if (towns.find(t => t.name.toLowerCase() === townName.toLowerCase() && t.state === townState)) return;
    setQuickLoading(townName);
    try {
      const fips = STATE_FIPS[townState];
      const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=place:*&in=state:${fips}`;
      const response = await fetch(url);
      const data = await response.json();
      const [, ...rows] = data;
      const places = rows.map(([name, pop, income]) => ({
        fullName: name,
        name: name.split(",")[0].replace(/ (city|town|CDP|village|borough)$/i, "").trim(),
        population: parseInt(pop) || 0,
        medianIncome: parseInt(income) > 0 ? parseInt(income) : null,
      })).filter(p => p.population > 0);

      const place = places.find(p => p.name.toLowerCase() === townName.toLowerCase());
      if (place) {
        setTowns(prev => [...prev, {
          name: place.name,
          state: townState,
          population: place.population,
          medianIncome: place.medianIncome,
          manual: false,
          id: Date.now(),
        }]);
      }
    } catch (err) {
      console.error("Quick add failed:", err);
    } finally {
      setQuickLoading(null);
    }
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <div className="header">
          <div className="subtitle">SwipeHeist</div>
          <h1 className="title">
            Your town is being<br />
            <span className="accent">robbed</span> daily
          </h1>
          <p className="description">
            Every card swipe sends a cut to Visa, Mastercard, and payment processors.
            See what your community actually pays — powered by real Census data.
          </p>
        </div>

        {/* Search */}
        <div className="search-panel">
          <div className="search-row">
            <select
              value={stateAbbr}
              onChange={e => setStateAbbr(e.target.value)}
              className="state-select"
            >
              {STATE_ABBR_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="search-input-wrapper">
              <input
                type="text"
                placeholder={placesLoading ? "Loading places..." : "Search for a town or city..."}
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setError(""); }}
                disabled={placesLoading}
                className="search-input"
              />
              {searchTerm.trim() && !placesLoading && (
                <div className="search-dropdown">
                  {filteredPlaces.length > 0 ? (
                    filteredPlaces.map((place, i) => (
                      <div
                        key={i}
                        className="search-option"
                        onClick={() => addTown(place)}
                      >
                        <span className="place-name">{place.name}</span>
                        <span className="place-meta">
                          Pop. {place.population.toLocaleString()}
                          {place.medianIncome && ` · $${(place.medianIncome/1000).toFixed(0)}k HHI`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="search-no-results">
                      No matches found. Make sure you selected the correct state.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {placesLoading && (
            <div className="loading-msg">
              <div className="spinner" />
              Loading {stateAbbr} places from Census...
            </div>
          )}

          {!placesLoading && statePlaces.length > 0 && (
            <div className="places-count">
              {statePlaces.length} places loaded from Census ACS 2022
            </div>
          )}

          {/* Manual entry toggle */}
          <button
            className="manual-toggle"
            onClick={() => setShowManual(!showManual)}
          >
            {showManual ? "Hide manual entry" : "Can't find your town? Enter manually"}
          </button>

          {showManual && (
            <div className="manual-entry">
              <div className="manual-row">
                <input
                  type="text"
                  placeholder="Town name"
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  className="manual-input"
                />
                <input
                  type="number"
                  placeholder="Population"
                  value={manualPop}
                  onChange={e => setManualPop(e.target.value)}
                  className="manual-input"
                />
                <input
                  type="number"
                  placeholder="Median income (optional)"
                  value={manualIncome}
                  onChange={e => setManualIncome(e.target.value)}
                  className="manual-input"
                />
                <button onClick={addManualTown} className="manual-add-btn">
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Quick adds for famous small towns */}
          <div className="quick-add">
            <span className="quick-label">Try these towns:</span>
            <div className="quick-buttons">
              {QUICK_TOWNS.map(({ name, state }) => {
                const added = towns.find(t => t.name.toLowerCase() === name.toLowerCase() && t.state === state);
                const isLoading = quickLoading === name;
                return (
                  <button
                    key={name}
                    onClick={() => quickAdd(name, state)}
                    disabled={!!added || isLoading}
                    className={`quick-btn ${added ? "added" : ""}`}
                  >
                    {isLoading ? "..." : `${name}, ${state}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Aggregate totals */}
        {towns.length > 1 && (
          <div className="aggregate">
            <div className="aggregate-left">
              <div className="aggregate-label">
                {towns.length} towns · {totalPop.toLocaleString()} people · Leaving daily
              </div>
              <div className="aggregate-daily">
                <AnimatedNumber value={totalDaily} />
              </div>
            </div>
            <div className="aggregate-right">
              <div className="aggregate-label">Yearly drain</div>
              <div className="aggregate-yearly">
                <AnimatedNumber value={totalYearly} />
              </div>
            </div>
          </div>
        )}

        {/* Town cards */}
        <div className="cards-grid">
          {towns.map(town => (
            <TownCard key={town.id} town={town} onRemove={() => removeTown(town.id)} />
          ))}
        </div>

        {towns.length === 0 && (
          <div className="empty-state">
            <div className="empty-arrow">↑</div>
            Search for a town to see the drain
            <div className="empty-hint">Add multiple cities to compare</div>
          </div>
        )}

        {/* Methodology */}
        <div className="methodology">
          <div className="methodology-title">Data Sources & Methodology</div>
          <p>
            Population and median household income sourced from <strong>U.S. Census Bureau American Community Survey (ACS) 2022</strong>.
            Per-capita spending derived from local income using BLS Consumer Expenditure Survey ratios
            ({(NATIONAL_SPENDING_RATIO * 100).toFixed(0)}% of pre-tax income, {AVG_HOUSEHOLD_SIZE} persons/household avg).
            Card share of {(CARD_SHARE * 100).toFixed(0)}% from the Federal Reserve Payments Study.
            Blended processing fee of {(AVG_PROCESSING_FEE_PERCENT * 100).toFixed(2)}% + ${AVG_PROCESSING_FEE_FIXED.toFixed(2)}/txn based on modern processors (Square, Toast, Stripe).
            These are community-wide estimates — actual figures vary by local economy and processor contracts.
          </p>
          <p className="disclaimer">
            <strong>Disclaimer:</strong> Terms like "heist" and "robbed" are used hyperbolically to illustrate the economic
            impact of processing fees on local communities. Credit card processing is a legal business practice.
            This site aims to raise awareness about where consumer dollars go — not to accuse any company of criminal activity.
          </p>
        </div>

        {/* Why This Matters */}
        <div className="why-section">
          <h2 className="why-title">Why This Matters</h2>

          <div className="why-card">
            <h3 className="why-card-title">The Billion Dollar Heist</h3>
            <p>
              In 2023, Visa reported <strong>$32.7 billion in revenue</strong>. Mastercard pulled in <strong>$25.1 billion</strong>.
              These aren't small businesses scraping by — they're among the most profitable companies on Earth,
              with profit margins exceeding 50%. Every time you tap your card, a piece of your purchase leaves
              your community and flows to their shareholders.
            </p>
          </div>

          <div className="why-card">
            <h3 className="why-card-title">Death by a Thousand Swipes</h3>
            <p>
              For a small business with $500,000 in annual card sales, processing fees eat up <strong>$15,000+ per year</strong>.
              That's a part-time employee. That's new equipment. That's the owner's kid's college fund.
              Multiply that across every business in your town, and you start to see the real cost of "convenience."
            </p>
          </div>

          <div className="why-card">
            <h3 className="why-card-title">Money That Leaves Never Comes Back</h3>
            <p>
              When you spend $100 at a local shop with cash, that money circulates locally — the owner pays
              employees, buys supplies, eats at the restaurant next door. Studies show local dollars circulate
              <strong> 3-7 times</strong> before leaving a community. But processing fees? They leave immediately,
              with zero local benefit. It's a one-way wealth extraction pipeline from Main Street to Wall Street.
            </p>
          </div>

          <div className="why-card highlight">
            <h3 className="why-card-title">The Simple Fix: Use Cash</h3>
            <p>
              The most direct way to keep money in your community is the oldest: <strong>pay with cash</strong>.
              No fees. No middlemen. The full amount stays with the business. Yes, it's less convenient.
              But that convenience has a price — and your community is paying it.
            </p>
            <ul className="solution-list">
              <li>Withdraw cash weekly for local spending</li>
              <li>Ask small businesses if they offer cash discounts</li>
              <li>Use cards for online/big-box stores, cash for local spots</li>
              <li>Talk to your neighbors — awareness is the first step</li>
            </ul>
          </div>

          <div className="why-card future">
            <h3 className="why-card-title">The Future: Community-Owned Payment Systems</h3>
            <p>
              What if your town had its own payment network? No Visa cut. No Mastercard fees.
              Just neighbors paying neighbors, with transaction fees (if any) staying local.
              It's not science fiction — community currencies and local payment systems are growing worldwide.
              <strong> More on this coming soon.</strong>
            </p>
          </div>
        </div>

        {/* Support */}
        <div className="support-section">
          <div className="support-card">
            <h3 className="support-title">Built by a regular person, not a corporation</h3>
            <p className="support-text">
              I'm just a guy who got tired of watching billion-dollar companies siphon money out of
              hardworking communities. I built this tool to make the invisible visible — because you
              can't fix a problem you can't see. No VC funding, no corporate sponsors, no agenda
              except helping people understand where their money actually goes.
            </p>
            <p className="support-text">
              If this opened your eyes, consider throwing a few bucks my way. Every dollar goes toward
              keeping this site running and building more tools to help communities fight back.
            </p>
            <div className="support-buttons">
              <a
                href="https://paypal.me/ZPXNB3MNMGSWC"
                target="_blank"
                rel="noopener noreferrer"
                className="support-button paypal"
              >
                PayPal
              </a>
              <button
                className="support-button crypto"
                onClick={() => {
                  navigator.clipboard.writeText("0xA9dDf7941DB057c77D6F1A8D7f7865Da84779EAf");
                  alert("ETH address copied to clipboard!");
                }}
              >
                ETH
              </button>
            </div>
            <p className="wallet-note">Click ETH to copy wallet address</p>
          </div>
        </div>
      </div>
    </div>
  );
}
