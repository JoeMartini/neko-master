"use client";

import { useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { Globe, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatNumber } from "@/lib/utils";
import { useCountryName } from "@/lib/i18n-country";
import type { CountryStats } from "@neko-master/shared";

interface WorldTrafficMapProps {
  data: CountryStats[];
}

// World map GeoJSON URL (lightweight topojson)
const GEO_URL = "/topojson/countries-110m.json";

// Country name mappings (ISO code -> GeoJSON name)
const COUNTRY_NAME_MAPPING: Record<string, string> = {
  US: "United States of America",
  CN: "China",
  JP: "Japan",
  SG: "Singapore",
  HK: "Hong Kong",
  TW: "Taiwan",
  KR: "South Korea",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  BR: "Brazil",
  RU: "Russia",
  SE: "Sweden",
  CH: "Switzerland",
  IL: "Israel",
  // Add more mappings as needed
};

// Map colors are inline SVG values, so both themes are defined here instead
// of Tailwind classes. Dark ramps from deep indigo to bright indigo so high
// traffic pops on the dark background.
const MAP_THEME = {
  light: {
    noData: "#f1f5f9",
    stroke: "#cbd5e1",
    scale: ["#e0e7ff", "#818cf8", "#6366f1", "#4f46e5"],
  },
  dark: {
    noData: "#1e2536",
    stroke: "rgba(148, 163, 184, 0.18)",
    scale: ["#312e81", "#4f46e5", "#818cf8", "#c7d2fe"],
  },
} as const;

export function WorldTrafficMap({ data }: WorldTrafficMapProps) {
  const t = useTranslations("map");
  const { resolvedTheme } = useTheme();
  const mapTheme = resolvedTheme === "dark" ? MAP_THEME.dark : MAP_THEME.light;
  const countryName = useCountryName();
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    country: string;
    traffic: number;
    download: number;
    upload: number;
    connections: number;
    x: number;
    y: number;
  } | null>(null);

  // Calculate total traffic for scaling
  const maxTraffic = useMemo(() => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map((d) => d.totalDownload + d.totalUpload));
  }, [data]);

  // Create color scale (theme-aware)
  const colorScale = useMemo(() => {
    return scaleLinear<string>()
      .domain([0, maxTraffic * 0.1, maxTraffic * 0.5, maxTraffic])
      .range([...mapTheme.scale]);
  }, [maxTraffic, mapTheme]);

  // Create country lookup map
  const countryMap = useMemo(() => {
    const map = new Map<string, CountryStats>();
    if (!data) return map;
    data.forEach((country) => {
      map.set(country.country, country);
      // Also map by full name
      const fullName = COUNTRY_NAME_MAPPING[country.country];
      if (fullName) {
        map.set(fullName, country);
      }
    });
    return map;
  }, [data]);

  // Get color for a geography
  const getFillColor = (geo: any) => {
    const geoName = geo.properties.name;
    const isoCode = geo.properties.ISO_A2 || geo.properties.iso_a2;

    // Try to find country by ISO code first, then by name
    let countryData = countryMap.get(isoCode);
    if (!countryData) {
      countryData = countryMap.get(geoName);
    }

    if (
      countryData &&
      countryData.country !== "LOCAL" &&
      countryData.country !== "Unknown"
    ) {
      const traffic = countryData.totalDownload + countryData.totalUpload;
      return colorScale(traffic);
    }

    // Default color for countries with no data
    return mapTheme.noData;
  };

  // Handle mouse enter
  const handleMouseEnter = (geo: any, event: any) => {
    const geoName = geo.properties.name;
    const isoCode = geo.properties.ISO_A2 || geo.properties.iso_a2;

    let countryData = countryMap.get(isoCode);
    if (!countryData) {
      countryData = countryMap.get(geoName);
    }

    if (countryData && countryData.country !== "LOCAL") {
      const rect = event.target.getBoundingClientRect();
      setTooltipData({
        country: countryName(countryData.country),
        traffic: countryData.totalDownload + countryData.totalUpload,
        download: countryData.totalDownload,
        upload: countryData.totalUpload,
        connections: countryData.totalConnections,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setHoveredCountry(geoName);
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredCountry(null);
    setTooltipData(null);
  };

  // Get top countries for legend
  const topCountries = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .filter((c) => c.country !== "LOCAL" && c.country !== "Unknown")
      .sort(
        (a, b) =>
          b.totalDownload + b.totalUpload - (a.totalDownload + a.totalUpload),
      )
      .slice(0, 5);
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* World Map */}
        <div className="relative aspect-[2/1] w-full bg-slate-50 dark:bg-slate-900/50 rounded-lg overflow-hidden">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 150,
              center: [0, 40],
            }}
            style={{
              width: "100%",
              height: "100%",
            }}>
            <ZoomableGroup>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getFillColor(geo)}
                      stroke={mapTheme.stroke}
                      strokeWidth={0.5}
                      style={{
                        default: {
                          outline: "none",
                          transition: "all 250ms",
                        },
                        hover: {
                          fill:
                            hoveredCountry === geo.properties.name
                              ? "#f59e0b"
                              : undefined,
                          outline: "none",
                          cursor: "pointer",
                        },
                        pressed: {
                          outline: "none",
                        },
                      }}
                      onMouseEnter={(event) => handleMouseEnter(geo, event)}
                      onMouseLeave={handleMouseLeave}
                    />
                  ))
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip */}
          {tooltipData && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: "50%",
                top: "20px",
                transform: "translateX(-50%)",
              }}>
              <div className="glass-card px-4 py-3 rounded-lg border shadow-lg min-w-[200px]">
                <p className="font-semibold text-sm mb-2">
                  {tooltipData.country}
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("total")}:</span>
                    <span className="font-medium">
                      {formatBytes(tooltipData.traffic)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-500">↓ {t("download")}:</span>
                    <span>{formatBytes(tooltipData.download)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-500">↑ {t("upload")}:</span>
                    <span>{formatBytes(tooltipData.upload)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-500">{t("connections")}:</span>
                    <span>{formatNumber(tooltipData.connections)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info hint */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
            <Info className="w-3 h-3" />
            <span>{t("hoverHint")}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Color scale legend */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("traffic")}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs">{t("low")}</span>
              <div className="flex">
                {mapTheme.scale.map((color) => (
                  <div key={color} className="w-6 h-3" style={{ backgroundColor: color }} />
                ))}
              </div>
              <span className="text-xs">{t("high")}</span>
            </div>
          </div>

          {/* Top countries list */}
          <div className="flex flex-wrap gap-3">
            {topCountries.map((country) => {
              const traffic = country.totalDownload + country.totalUpload;
              return (
                <div
                  key={country.country}
                  className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: colorScale(traffic) }}
                  />
                  <span className="text-muted-foreground">
                    {countryName(country.country)}
                  </span>
                  <span className="font-medium">{formatBytes(traffic)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
