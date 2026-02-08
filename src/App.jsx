import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
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

      <div className="impact-section">
        <div className="impact-title">Imagine what {formatFullMoney(yearly)} could do for {town.name}:</div>
        <div className="impact-list">
          {yearly >= 5000000 && (
            <span className="impact-item">{Math.floor(yearly / 5000000)} high school stadium{Math.floor(yearly / 5000000) > 1 ? 's' : ''}</span>
          )}
          <span className="impact-item">{Math.floor(yearly / 60000)} teacher salaries</span>
          <span className="impact-item">{Math.floor(yearly / 100000)} school buses</span>
          <span className="impact-item">{Math.floor(yearly / 1000000)} miles of road repair</span>
          {yearly >= 500000 && (
            <span className="impact-item">{Math.floor(yearly / 500000)} fire trucks</span>
          )}
        </div>
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
  const resultsRef = useRef(null);

  const downloadImage = async () => {
    if (!resultsRef.current) return;
    try {
      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: '#0a0710',
        scale: 2,
      });
      const link = document.createElement('a');
      link.download = `swipeheist-${towns.map(t => t.name.toLowerCase()).join('-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Failed to capture image:', err);
    }
  };

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

        {/* Results section for screenshot */}
        <div ref={resultsRef} className="results-capture">
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

          {/* Watermark for shared images */}
          {towns.length > 0 && (
            <div className="watermark">swipeheist.com</div>
          )}
        </div>

        {towns.length === 0 && (
          <div className="empty-state">
            <div className="empty-arrow">↑</div>
            Search for a town to see the drain
            <div className="empty-hint">Add multiple cities to compare</div>
          </div>
        )}

        {/* Social Share */}
        {towns.length > 0 && (
          <div className="share-section">
            <p className="share-label">Share this with your community</p>
            <div className="share-buttons">
              <button
                className="share-btn twitter"
                title="Share on X / Twitter"
                onClick={() => {
                  const text = towns.length === 1
                    ? `${towns[0].name}, ${towns[0].state} loses $${Math.round(dailyCalc(towns[0]) * 365).toLocaleString()}/year to credit card processors. See how much YOUR town loses:`
                    : `These ${towns.length} towns lose $${Math.round(totalYearly).toLocaleString()}/year to credit card processors. See how much YOUR town loses:`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://swipeheist.com')}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </button>
              <button
                className="share-btn facebook"
                title="Share on Facebook"
                onClick={() => {
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://swipeheist.com')}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </button>
              <button
                className="share-btn linkedin"
                title="Share on LinkedIn"
                onClick={() => {
                  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://swipeheist.com')}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </button>
              <button
                className="share-btn reddit"
                title="Share on Reddit"
                onClick={() => {
                  const title = towns.length === 1
                    ? `${towns[0].name}, ${towns[0].state} loses $${Math.round(dailyCalc(towns[0]) * 365).toLocaleString()}/year to credit card processors`
                    : `These ${towns.length} towns lose $${Math.round(totalYearly).toLocaleString()}/year to credit card processors`;
                  window.open(`https://www.reddit.com/submit?url=${encodeURIComponent('https://swipeheist.com')}&title=${encodeURIComponent(title)}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
              </button>
              <button
                className="share-btn whatsapp"
                title="Share on WhatsApp"
                onClick={() => {
                  const text = towns.length === 1
                    ? `${towns[0].name}, ${towns[0].state} loses $${Math.round(dailyCalc(towns[0]) * 365).toLocaleString()}/year to credit card processors. See how much YOUR town loses: https://swipeheist.com`
                    : `These ${towns.length} towns lose $${Math.round(totalYearly).toLocaleString()}/year to credit card processors. See how much YOUR town loses: https://swipeheist.com`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </button>
              <button
                className="share-btn email"
                title="Share via Email"
                onClick={() => {
                  const subject = "See how much your town loses to credit card fees";
                  const body = towns.length === 1
                    ? `${towns[0].name}, ${towns[0].state} loses $${Math.round(dailyCalc(towns[0]) * 365).toLocaleString()}/year to credit card processors.\n\nSee how much YOUR town loses: https://swipeheist.com`
                    : `These ${towns.length} towns lose $${Math.round(totalYearly).toLocaleString()}/year to credit card processors.\n\nSee how much YOUR town loses: https://swipeheist.com`;
                  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              </button>
              <button
                className="share-btn copy"
                title="Copy Link"
                onClick={() => {
                  navigator.clipboard.writeText('https://swipeheist.com');
                  alert('Link copied!');
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              </button>
            </div>
            <button
              className="download-btn"
              onClick={downloadImage}
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Download Image
            </button>
            <p className="share-note">Download and share on Instagram, or anywhere else!</p>
          </div>
        )}

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
              <button
                className="support-button crypto"
                onClick={() => {
                  navigator.clipboard.writeText("0xA9dDf7941DB057c77D6F1A8D7f7865Da84779EAf");
                  alert("ETH address copied to clipboard!");
                }}
              >
                Send ETH
              </button>
            </div>
            <p className="wallet-note">Click to copy wallet address</p>
          </div>
        </div>

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
      </div>
    </div>
  );
}
