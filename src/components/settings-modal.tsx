"use client";

import {
  useNetworkConfig,
  NetworkConfigType,
  PresetType,
  PRESET_CONFIGS,
} from "@/providers/network-config-provider";
import { useState, useEffect } from "react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightApiKey?: boolean;
}

export function SettingsModal({
  open,
  onOpenChange,
  highlightApiKey = false,
}: SettingsModalProps) {
  const { currentConfig, currentPreset, setNetworkConfig } = useNetworkConfig();
  const [selectedPreset, setSelectedPreset] =
    useState<PresetType>(currentPreset);
  const [formValues, setFormValues] = useState({
    NILAUTH_URL: "",
    NILDB_NODES: ["", "", ""],
    NILLION_API_KEY: "",
  });

  useEffect(() => {
    if (open) {
      setSelectedPreset(currentPreset);
      setFormValues({
        NILAUTH_URL: currentConfig.NILAUTH_URL,
        NILDB_NODES: [...currentConfig.NILDB_NODES],
        NILLION_API_KEY: currentConfig.NILLION_API_KEY || "",
      });
    }
  }, [open, currentConfig, currentPreset]);

  const handleSave = () => {
    setNetworkConfig(
      formValues as unknown as NetworkConfigType,
      selectedPreset
    );
    onOpenChange(false);
  };

  const handlePresetChange = (preset: PresetType) => {
    setSelectedPreset(preset);

    if (preset !== "custom") {
      // Load preset values but keep the current API key
      const presetConfig = PRESET_CONFIGS[preset];
      setFormValues({
        NILAUTH_URL: presetConfig.NILAUTH_URL,
        NILDB_NODES: [...presetConfig.NILDB_NODES],
        NILLION_API_KEY: formValues.NILLION_API_KEY,
      });
    }
  };

  const handleInputChange = (field: keyof NetworkConfigType, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Switch to custom when user edits network values (but not API key)
    if (selectedPreset !== "custom" && field !== "NILLION_API_KEY") {
      setSelectedPreset("custom");
    }
  };

  const handleNodeChange = (index: number, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      NILDB_NODES: prev.NILDB_NODES.map((node, i) =>
        i === index ? value : node
      ),
    }));

    // Switch to custom when user edits values
    if (selectedPreset !== "custom") {
      setSelectedPreset("custom");
    }
  };

  const hasChanges =
    JSON.stringify(formValues) !== JSON.stringify(currentConfig) ||
    selectedPreset !== currentPreset;

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="nillion-card w-full max-w-xl max-h-[85vh] overflow-y-auto">
        <div className="p-4">
          <div className="flex justify-between items-start mb-3">
            <h2 className="text-2xl font-heading">
              nilDB Network Configuration
            </h2>
            <button
              onClick={() => onOpenChange(false)}
              className="nillion-button-ghost nillion-small"
              style={{ padding: "0.25rem" }}
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Preset Selection */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-medium tracking-wide uppercase">
                Network Preset
              </label>
              <a
                href="https://docs.nillion.com/build/network-config#nildb-nodes"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-nillion-text-secondary hover:text-nillion-primary transition-colors inline-flex items-center gap-1"
              >
                [see Nillion docs
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                ]
              </a>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePresetChange("testnet")}
                className={`font-heading text-base tracking-wide transition-all duration-300 ${
                  selectedPreset === "testnet"
                    ? "nillion-button-primary"
                    : "nillion-button-ghost"
                }`}
              >
                Testnet
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange("custom")}
                className={`font-heading text-base tracking-wide transition-all duration-300 ${
                  selectedPreset === "custom"
                    ? "nillion-button-primary"
                    : "nillion-button-ghost"
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium tracking-wide uppercase mb-1">
                Nilauth URL
              </label>
              <input
                type="text"
                value={formValues.NILAUTH_URL}
                onChange={(e) =>
                  handleInputChange("NILAUTH_URL", e.target.value)
                }
                className="w-full font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium tracking-wide uppercase mb-1">
                NilDB Nodes
              </label>
              <div className="space-y-1">
                {formValues.NILDB_NODES.map((node, index) => (
                  <div key={index}>
                    <input
                      type="text"
                      value={node}
                      onChange={(e) => handleNodeChange(index, e.target.value)}
                      className="w-full font-mono text-sm"
                      placeholder={`Node ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <label
                  className={`text-xs font-medium tracking-wide uppercase ${
                    highlightApiKey ? "text-red-600" : ""
                  }`}
                >
                  API Key
                  {highlightApiKey && (
                    <span className="text-red-600 ml-1">*</span>
                  )}
                </label>
                <a
                  href="https://docs.nillion.com/build/network-api-access"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-nillion-text-secondary hover:text-nillion-primary transition-colors inline-flex items-center gap-1"
                >
                  [see Nillion docs
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  ]
                </a>
              </div>
              <input
                type="password"
                value={formValues.NILLION_API_KEY || ""}
                onChange={(e) =>
                  handleInputChange("NILLION_API_KEY", e.target.value)
                }
                className={`w-full font-mono text-sm ${
                  highlightApiKey ? "border-red-500 focus:border-red-600" : ""
                }`}
                placeholder="Your API key"
                autoFocus={highlightApiKey}
              />
              {highlightApiKey && (
                <p className="text-xs text-red-600 mt-1">
                  A valid Nillion API key is required
                </p>
              )}
              <p className="text-xs text-nillion-text-secondary mt-1">
                Stored in localStorage for development only
              </p>
              <div className="mt-1 p-2 nillion-card border-2 border-nillion-primary text-sm">
                <p className="text-nillion-primary font-medium">
                  ⚠️ Warning: This tool is for testing purposes only. Only use
                  Testnet API keys.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-3 pt-3 border-t border-nillion-border">
            <span className="text-xs text-nillion-text-secondary uppercase tracking-wide">
              {selectedPreset}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => onOpenChange(false)}
                className="nillion-button-outline"
              >
                Cancel
              </button>
              <button onClick={handleSave} className="nillion-button">
                Save
              </button>
            </div>
          </div>

          {hasChanges && (
            <p className="text-xs text-nillion-text-secondary text-center mt-3">
              Page will reload to apply changes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
