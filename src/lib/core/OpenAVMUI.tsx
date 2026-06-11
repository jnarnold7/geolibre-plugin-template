import React, { useState, useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PluginControl } from './PluginControl';

interface OpenAVMUIProps {
  map: MapLibreMap | undefined;
  control: PluginControl;
}

export const OpenAVMUI: React.FC<OpenAVMUIProps> = ({ map, control: _control }) => {
  const [activeTab, setActiveTab] = useState<'sample' | 'custom'>('sample');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Pipeline Results
  const [results, setResults] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [geojson, setGeojson] = useState<any>(null);
  
  // Map visualization state
  const [colorBy, setColorBy] = useState<'ratio' | 'prediction' | 'class' | 'none'>('ratio');

  // Custom run form state
  const [camaFile, setCamaFile] = useState<File | null>(null);
  const [geoFile, setGeoFile] = useState<File | null>(null);
  const [countyName, setCountyName] = useState<string>('Beckham');
  const [analystName, setAnalystName] = useState<string>('Jane Doe');
  const [year, setYear] = useState<number>(2026);
  const [ratio, setRatio] = useState<number>(0.12);
  const [fips, setFips] = useState<string>('40009');
  const [models, setModels] = useState<string>('mra,lightgbm,xgboost');

  const API_URL = 'http://localhost:8000';

  // Cleanup Map Layers on unmount
  useEffect(() => {
    return () => {
      removeMapLayers();
    };
  }, []);

  // Update map colors when colorBy or geojson changes
  useEffect(() => {
    if (map && geojson) {
      applyMapStyling();
    }
  }, [colorBy, geojson, map]);

  const removeMapLayers = () => {
    if (!map) return;
    try {
      if (map.getLayer('openavm-parcels-fill')) map.removeLayer('openavm-parcels-fill');
      if (map.getLayer('openavm-parcels-line')) map.removeLayer('openavm-parcels-line');
      if (map.getSource('openavm-parcels')) map.removeSource('openavm-parcels');
    } catch (e) {
      console.error('Error removing map layers:', e);
    }
  };

  const applyMapStyling = () => {
    if (!map || !geojson) return;

    const sourceId = 'openavm-parcels';
    const fillLayerId = 'openavm-parcels-fill';
    const lineLayerId = 'openavm-parcels-line';

    // Ensure source exists
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson
      });
    } else {
      (map.getSource(sourceId) as any).setData(geojson);
    }

    // Ensure layers exist
    if (!map.getLayer(fillLayerId)) {
      map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-opacity': 0.75
        }
      });

      // Add click popup handler
      map.on('click', fillLayerId, (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        const props = feature.properties;
        
        let html = `<div style="font-family: sans-serif; font-size: 11px; line-height: 1.4; color: #333; min-width: 160px; max-width: 240px;">
          <h4 style="margin: 0 0 6px 0; border-bottom: 1px solid #ccc; padding-bottom: 3px; color: #1f2937; font-weight: bold;">
            Parcel: ${props.Account || props.key || 'N/A'}
          </h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="color: #666;">Class:</td><td style="font-weight: 500; text-align: right;">${props.property_class || 'N/A'}</td></tr>
            <tr><td style="color: #666;">Nbhd:</td><td style="font-weight: 500; text-align: right;">${props.nbhd_desc || props.nbhd || 'N/A'}</td></tr>
            <tr><td style="color: #666;">Sale Price:</td><td style="font-weight: 500; text-align: right;">${props.sale_price ? '$' + Number(props.sale_price).toLocaleString() : 'N/A'}</td></tr>
            <tr><td style="color: #666;">Valuation:</td><td style="font-weight: 500; text-align: right;">${props.prediction ? '$' + Math.round(Number(props.prediction)).toLocaleString() : 'N/A'}</td></tr>
            <tr><td style="color: #666;">Roll Value:</td><td style="font-weight: 500; text-align: right;">${props.assr_market_value ? '$' + Number(props.assr_market_value).toLocaleString() : 'N/A'}</td></tr>`;
        
        if (props.ratio) {
          const ratioVal = Number(props.ratio);
          let ratioColor = '#10b981'; // green
          if (ratioVal < 0.9) ratioColor = '#3b82f6'; // blue
          if (ratioVal > 1.1) ratioColor = '#ef4444'; // red
          html += `<tr><td style="color: #666;">AV/SP Ratio:</td><td style="font-weight: bold; color: ${ratioColor}; text-align: right;">${ratioVal.toFixed(4)}</td></tr>`;
        }
        
        html += `</table></div>`;

        // Find centroid or use clicked coordinates
        new (window as any).maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });

      // Change cursor on hover
      map.on('mouseenter', fillLayerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', fillLayerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    if (!map.getLayer(lineLayerId)) {
      map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
          'line-opacity': 0.6
        }
      });
    }

    // Style paint properties dynamically
    if (colorBy === 'ratio') {
      map.setPaintProperty(fillLayerId, 'fill-color', [
        'case',
        ['has', 'ratio'],
        [
          'interpolate',
          ['linear'],
          ['get', 'ratio'],
          0.7, '#3b82f6',  // blue (under-appraised)
          0.9, '#a7f3d0',  // light green
          1.0, '#10b981',  // green (perfect)
          1.1, '#fca5a5',  // light red
          1.3, '#ef4444'   // red (over-appraised)
        ],
        '#9ca3af' // fallback gray
      ]);
    } else if (colorBy === 'prediction') {
      map.setPaintProperty(fillLayerId, 'fill-color', [
        'case',
        ['has', 'prediction'],
        [
          'interpolate',
          ['linear'],
          ['get', 'prediction'],
          20000, '#fef08a',  // yellow
          100000, '#fde047',
          250000, '#ca8a04',
          500000, '#854d0e',
          1000000, '#451a03' // dark brown
        ],
        '#9ca3af'
      ]);
    } else if (colorBy === 'class') {
      map.setPaintProperty(fillLayerId, 'fill-color', [
        'match',
        ['get', 'property_class'],
        'RR', '#38bdf8', // Single-family Residential (blue)
        'UR', '#0284c7', // Urban Residential (dark blue)
        'UC', '#f43f5e', // Urban Commercial (rose)
        'RC', '#be123c', // Rural Commercial (dark red)
        'RA', '#22c55e', // Agricultural (green)
        'X', '#a855f7',  // Exempt (purple)
        '#9ca3af'        // default gray
      ]);
    } else {
      map.setPaintProperty(fillLayerId, 'fill-color', '#9ca3af');
    }

    // Fit map bounds to the geojson features
    try {
      const coordinates = geojson.features.reduce((acc: any[], feat: any) => {
        if (feat.geometry && feat.geometry.coordinates) {
          if (feat.geometry.type === 'Polygon') {
            feat.geometry.coordinates[0].forEach((coord: any) => acc.push(coord));
          } else if (feat.geometry.type === 'MultiPolygon') {
            feat.geometry.coordinates.forEach((poly: any) => {
              poly[0].forEach((coord: any) => acc.push(coord));
            });
          }
        }
        return acc;
      }, []);

      if (coordinates.length > 0) {
        const bounds = coordinates.reduce((b: any, coord: any) => {
          return b.extend(coord);
        }, new (window as any).maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      }
    } catch (e) {
      console.warn('Could not fit bounds:', e);
    }
  };

  const runSampleAppraisal = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);
    setGeojson(null);
    setStatusMsg('Waking up Python environment & running pipeline...');

    try {
      const response = await fetch(`${API_URL}/run-sample`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        throw new Error(errDetail.detail || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setResults(data.results);
        setSummary(data.summary);
        setGeojson(data.geojson);
        setStatusMsg('Appraisal run successfully. Rendering map layers...');
      } else {
        throw new Error('Pipeline failed without details.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error communicating with local OpenAVMKit server.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomRunSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camaFile || !geoFile) {
      setError('Please select both CAMA CSV and Geometry GeoJSON files.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);
    setGeojson(null);
    setStatusMsg('Uploading datasets & running model pipeline...');

    try {
      const formData = new FormData();
      formData.append('cama_file', camaFile);
      formData.append('geo_file', geoFile);
      formData.append('county_name', countyName);
      formData.append('analyst_name', analystName);
      formData.append('assessment_year', year.toString());
      formData.append('assessment_ratio', ratio.toString());
      formData.append('fips_code', fips);
      formData.append('models', models);

      const response = await fetch(`${API_URL}/run`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        throw new Error(errDetail.detail || `Server error ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setResults(data.results);
        setSummary(data.summary);
        setGeojson(data.geojson);
        setStatusMsg('Appraisal run successfully. Rendering custom layers...');
      } else {
        throw new Error('Pipeline run failed.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error running custom mass appraisal.');
    } finally {
      setLoading(false);
    }
  };

  const getPassBadge = (pass: boolean | null | undefined) => {
    if (pass === true) return <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#10b981', color: 'white', fontWeight: 'bold', fontSize: '9px' }}>PASS</span>;
    if (pass === false) return <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#ef4444', color: 'white', fontWeight: 'bold', fontSize: '9px' }}>FAIL</span>;
    return <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#6b7280', color: 'white', fontWeight: 'bold', fontSize: '9px' }}>N/A</span>;
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      
      {/* Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--pc-border)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveTab('sample')}
          style={{
            flex: 1, padding: '6px', background: activeTab === 'sample' ? 'var(--pc-accent)' : 'transparent',
            color: activeTab === 'sample' ? 'white' : 'var(--pc-text)', border: 'none', borderRadius: '4px 4px 0 0',
            fontWeight: activeTab === 'sample' ? 'bold' : 'normal', cursor: 'pointer'
          }}
        >
          Beckham County Demo
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          style={{
            flex: 1, padding: '6px', background: activeTab === 'custom' ? 'var(--pc-accent)' : 'transparent',
            color: activeTab === 'custom' ? 'white' : 'var(--pc-text)', border: 'none', borderRadius: '4px 4px 0 0',
            fontWeight: activeTab === 'custom' ? 'bold' : 'normal', cursor: 'pointer'
          }}
        >
          Custom Data Ingest
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'sample' ? (
        <div style={{ background: 'var(--pc-hover-bg)', padding: '10px', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, lineHeight: 1.4 }}>
            Test OpenAVMKit appraisal pipelines using synthetic, compliance-tuned data for Beckham County, OK. Contains 390 parcels and qualified sales.
          </p>
          <button
            onClick={runSampleAppraisal}
            disabled={loading}
            style={{
              padding: '8px 12px', background: 'var(--pc-accent)', color: 'white', border: 'none',
              borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', alignSelf: 'start'
            }}
          >
            {loading ? 'Processing Model...' : 'Run Demo Appraisal'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleCustomRunSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold' }}>CAMA CSV File:</label>
            <input type="file" accept=".csv" onChange={(e) => setCamaFile(e.target.files?.[0] || null)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '2px', fontWeight: 'bold' }}>GIS GeoJSON Parcels:</label>
            <input type="file" accept=".geojson,.json" onChange={(e) => setGeoFile(e.target.files?.[0] || null)} style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '2px' }}>County:</label>
              <input type="text" value={countyName} onChange={(e) => setCountyName(e.target.value)} style={{ width: '100%', padding: '4px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '2px' }}>Assmt Year:</label>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: '100%', padding: '4px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '2px' }}>Ratio (e.g. 0.12):</label>
              <input type="number" step="0.01" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} style={{ width: '100%', padding: '4px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '2px' }}>FIPS:</label>
              <input type="text" value={fips} onChange={(e) => setFips(e.target.value)} style={{ width: '100%', padding: '4px' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '2px' }}>Analyst Name:</label>
            <input type="text" value={analystName} onChange={(e) => setAnalystName(e.target.value)} style={{ width: '100%', padding: '4px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '2px' }}>Appraisal Models (CSV):</label>
            <input type="text" value={models} onChange={(e) => setModels(e.target.value)} style={{ width: '100%', padding: '4px' }} />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 12px', background: 'var(--pc-accent)', color: 'white', border: 'none',
              borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', alignSelf: 'start', marginTop: '4px'
            }}
          >
            {loading ? 'Uploading & Appraising...' : 'Run Custom Pipeline'}
          </button>
        </form>
      )}

      {/* Status or Error Alerts */}
      {loading && (
        <div style={{ padding: '8px', borderLeft: '3px solid var(--pc-accent)', background: 'var(--pc-hover-bg)', animation: 'pulse 1.5s infinite' }}>
          <div style={{ fontWeight: 'bold' }}>Pipeline Running</div>
          <div style={{ color: 'var(--pc-muted)', fontSize: '11px' }}>{statusMsg}</div>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px', borderLeft: '3px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c' }}>
          <div style={{ fontWeight: 'bold' }}>Error Encountered</div>
          <div style={{ fontSize: '11px' }}>{error}</div>
          <div style={{ fontSize: '10px', marginTop: '4px', color: '#6b7280' }}>Ensure the FastAPI python server is running on port 8000.</div>
        </div>
      )}

      {/* Results View */}
      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
          
          {/* Map Coloring Panel */}
          <div style={{ padding: '8px', background: 'var(--pc-hover-bg)', borderRadius: '4px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/></svg>
              Map Visualization
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                onClick={() => setColorBy('ratio')}
                style={{
                  padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--pc-border)',
                  background: colorBy === 'ratio' ? 'var(--pc-accent)' : 'var(--pc-bg)',
                  color: colorBy === 'ratio' ? 'white' : 'var(--pc-text)', cursor: 'pointer', fontSize: '10px'
                }}
              >
                Appraised Ratio
              </button>
              <button
                onClick={() => setColorBy('prediction')}
                style={{
                  padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--pc-border)',
                  background: colorBy === 'prediction' ? 'var(--pc-accent)' : 'var(--pc-bg)',
                  color: colorBy === 'prediction' ? 'white' : 'var(--pc-text)', cursor: 'pointer', fontSize: '10px'
                }}
              >
                Valuation Value
              </button>
              <button
                onClick={() => setColorBy('class')}
                style={{
                  padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--pc-border)',
                  background: colorBy === 'class' ? 'var(--pc-accent)' : 'var(--pc-bg)',
                  color: colorBy === 'class' ? 'white' : 'var(--pc-text)', cursor: 'pointer', fontSize: '10px'
                }}
              >
                Property Class
              </button>
            </div>

            {/* Map Legend */}
            <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--pc-muted)' }}>
              {colorBy === 'ratio' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Ratio (AV/SP):</span>
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                    <span style={{ width: '8px', height: '8px', background: '#3b82f6', display: 'inline-block' }}></span> &lt; 0.90
                    <span style={{ width: '8px', height: '8px', background: '#10b981', display: 'inline-block', marginLeft: '6px' }}></span> 0.90-1.10
                    <span style={{ width: '8px', height: '8px', background: '#ef4444', display: 'inline-block', marginLeft: '6px' }}></span> &gt; 1.10
                  </div>
                </div>
              )}
              {colorBy === 'prediction' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Valuation:</span>
                  <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                    <span style={{ width: '8px', height: '8px', background: '#fef08a', display: 'inline-block' }}></span> low
                    <span style={{ width: '8px', height: '8px', background: '#ca8a04', display: 'inline-block', marginLeft: '6px' }}></span> mid
                    <span style={{ width: '8px', height: '8px', background: '#451a03', display: 'inline-block', marginLeft: '6px' }}></span> high
                  </div>
                </div>
              )}
              {colorBy === 'class' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><span style={{ width: '6px', height: '6px', background: '#38bdf8', display: 'inline-block' }}></span>Res SF</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><span style={{ width: '6px', height: '6px', background: '#0284c7', display: 'inline-block' }}></span>Res Urban</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><span style={{ width: '6px', height: '6px', background: '#f43f5e', display: 'inline-block' }}></span>Comm Urban</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><span style={{ width: '6px', height: '6px', background: '#be123c', display: 'inline-block' }}></span>Comm Rural</span>
                </div>
              )}
            </div>
          </div>

          {/* Compliance Summary Card */}
          <div style={{ padding: '10px', border: '1px solid var(--pc-border)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '13px' }}>Ratio Study Compliance</span>
              {getPassBadge(results.compliance_summary?.overall_pass)}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--pc-border)', paddingBottom: '3px' }}>
                <span>Median Ratio (0.90-1.10)</span>
                <span style={{ fontWeight: 'bold' }}>
                  {results.horizontal?.median_ratio?.toFixed(4) || 'N/A'} {getPassBadge(results.compliance_summary?.median_ratio?.pass)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--pc-border)', paddingBottom: '3px' }}>
                <span>COD (Dispersion, Res &lt; 15)</span>
                <span style={{ fontWeight: 'bold' }}>
                  {results.horizontal?.cod?.toFixed(2) || 'N/A'}% {getPassBadge(results.compliance_summary?.cod?.pass)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--pc-border)', paddingBottom: '3px' }}>
                <span>PRD (Vert Equity, 0.98-1.03)</span>
                <span style={{ fontWeight: 'bold' }}>
                  {results.prd?.prd?.toFixed(4) || 'N/A'} {getPassBadge(results.compliance_summary?.prd?.pass)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed var(--pc-border)', paddingBottom: '3px' }}>
                <span>PRB (Vert Bias, -0.05 - 0.05)</span>
                <span style={{ fontWeight: 'bold' }}>
                  {results.prb?.prb?.toFixed(4) || 'N/A'} {getPassBadge(results.compliance_summary?.prb?.pass)}
                </span>
              </div>
            </div>
          </div>

          {/* Equity & Statistical Insights */}
          <div style={{ padding: '8px', border: '1px solid var(--pc-border)', borderRadius: '4px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Equity & Quality Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'var(--pc-hover-bg)', padding: '6px', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--pc-muted)' }}>Vertical Equity Index</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{results.vei?.vei !== null ? results.vei?.vei?.toFixed(4) : 'N/A'}</div>
                <div style={{ fontSize: '9px', color: '#6b7280' }}>Trend: {results.vei?.trend || 'N/A'}</div>
              </div>
              <div style={{ background: 'var(--pc-hover-bg)', padding: '6px', borderRadius: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--pc-muted)' }}>MKI Quintos (0.95-1.05)</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{results.gini_kakwani?.mki !== undefined ? results.gini_kakwani?.mki?.toFixed(4) : 'N/A'}</div>
                <div style={{ fontSize: '9px', color: '#6b7280' }}>{getPassBadge(results.compliance_summary?.mki?.pass)}</div>
              </div>
            </div>
          </div>

          {/* Dataset Statistics */}
          <div style={{ padding: '8px', border: '1px solid var(--pc-border)', borderRadius: '4px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>Dataset Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', fontSize: '10px' }}>
              <div>Universe: <span style={{ fontWeight: 'bold' }}>{results.n_total_parcels}</span></div>
              <div>Sales: <span style={{ fontWeight: 'bold' }}>{results.n_valid_sales}</span></div>
              <div>Excluded: <span style={{ fontWeight: 'bold' }}>{results.n_excluded_sales}</span></div>
            </div>
            {summary && summary.models && Object.keys(summary.models).length > 0 && (
              <div style={{ marginTop: '8px', borderTop: '1px dashed var(--pc-border)', paddingTop: '6px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>Trained Models</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.keys(summary.models).map((modelName) => (
                    <span key={modelName} style={{ background: 'var(--pc-hover-bg)', padding: '2px 6px', borderRadius: '3px', fontSize: '9px' }}>
                      {modelName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
