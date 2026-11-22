"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Eye,
  Plus,
  Trash2,
  Type,
  PenTool,
  QrCode,
  Palette,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Move,
  RotateCw,
  Sparkles,
  Layers,
  Sliders,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CertificateTemplateRecord,
  TemplateCategory,
  TemplateField,
  SignatureConfig,
  TemplateLayoutConfig,
  PageDimensions,
} from "@/types/template";
import { STANDARD_PLACEHOLDERS, DEFAULT_PAGE_DIMENSIONS, TEMPLATE_PRESETS } from "@/lib/templates/presets";

export default function TemplateDesignerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const router = useRouter();
  const [slug, setSlug] = React.useState<string>("");
  const [templateId, setTemplateId] = React.useState<string>("");
  const [isNew, setIsNew] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Template Data state
  const [title, setTitle] = React.useState<string>("Untitled Certificate Template");
  const [description, setDescription] = React.useState<string>("");
  const [category, setCategory] = React.useState<TemplateCategory>("COURSE_COMPLETION");
  const [orientation, setOrientation] = React.useState<"LANDSCAPE" | "PORTRAIT">("LANDSCAPE");
  const [layout, setLayout] = React.useState<TemplateLayoutConfig>(TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig);

  // Selected element on canvas
  const [selectedType, setSelectedType] = React.useState<"field" | "signature" | "qr" | "border" | null>("field");
  const [selectedId, setSelectedId] = React.useState<string>("f_recipient");
  const [previewMode, setPreviewMode] = React.useState<boolean>(false);

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      setTemplateId(p.id);
      if (p.id === "new") {
        setIsNew(true);
        setLoading(false);
      } else {
        loadTemplate(p.slug, p.id);
      }
    });
  }, [params]);

  const loadTemplate = async (tenantSlug: string, id: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/templates/${id}`);
      if (!res.ok) throw new Error("Failed to load certificate template");
      const data = await res.json();
      const tmpl: CertificateTemplateRecord = data.data;

      setTitle(tmpl.title);
      setDescription(tmpl.description || "");
      setCategory(tmpl.category);
      setOrientation(tmpl.dimensions.orientation || "LANDSCAPE");
      setLayout(tmpl.layoutConfig);

      if (tmpl.layoutConfig.fields.length > 0) {
        setSelectedId(tmpl.layoutConfig.fields[0].id);
        setSelectedType("field");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const dimensions: PageDimensions = {
        width: orientation === "LANDSCAPE" ? 1120 : 792,
        height: orientation === "LANDSCAPE" ? 792 : 1120,
        orientation,
        unit: "PX",
      };

      const payload = {
        title,
        description,
        category,
        dimensions,
        layoutConfig: layout,
      };

      const url = isNew
        ? `/api/v1/tenants/${slug}/templates`
        : `/api/v1/tenants/${slug}/templates/${templateId}`;

      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save template");

      setSuccessMsg("Template layout saved successfully.");
      if (isNew && data.data?.id) {
        router.push(`/${slug}/templates/${data.data.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Field manipulation helpers
  const selectedField = layout.fields.find((f) => f.id === selectedId);

  const updateSelectedField = (updates: Partial<TemplateField>) => {
    setLayout((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === selectedId ? { ...f, ...updates } : f)),
    }));
  };

  const addField = (placeholderKey?: string, name?: string) => {
    const newId = `f_${Date.now()}`;
    const newField: TemplateField = {
      id: newId,
      name: name || "Custom Text",
      placeholder: placeholderKey || "Custom Placeholder {{custom}}",
      defaultValue: name || "Sample text value",
      x: 50,
      y: 50,
      fontSize: 16,
      fontFamily: "Inter, sans-serif",
      fontWeight: "medium",
      color: "#0f172a",
      align: "center",
    };

    setLayout((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedId(newId);
    setSelectedType("field");
  };

  const removeSelectedField = () => {
    if (!selectedField) return;
    setLayout((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== selectedId),
    }));
    setSelectedId("");
    setSelectedType(null);
  };

  // Signature helpers
  const selectedSignature = layout.signatures.find((s) => s.id === selectedId);

  const updateSelectedSignature = (updates: Partial<SignatureConfig>) => {
    setLayout((prev) => ({
      ...prev,
      signatures: prev.signatures.map((s) => (s.id === selectedId ? { ...s, ...updates } : s)),
    }));
  };

  const addSignature = () => {
    const newId = `sig_${Date.now()}`;
    const newSig: SignatureConfig = {
      id: newId,
      title: "Authorized Officer",
      signatoryName: "Official Signatory",
      x: 50,
      y: 84,
      width: 140,
      height: 48,
    };
    setLayout((prev) => ({
      ...prev,
      signatures: [...prev.signatures, newSig],
    }));
    setSelectedId(newId);
    setSelectedType("signature");
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading visual designer...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-4 border rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <Link href={`/${slug}/templates`}>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="space-y-0.5">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm font-bold border-transparent hover:border-input focus:border-input bg-transparent px-1 font-serif"
            />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{category}</span>
              <span>•</span>
              <span className="font-mono">{orientation}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={previewMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="gap-1.5 text-xs h-8"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{previewMode ? "Exit Preview" : "Sample Preview"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrientation(orientation === "LANDSCAPE" ? "PORTRAIT" : "LANDSCAPE")}
            className="gap-1.5 text-xs h-8"
            title="Toggle Orientation"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>{orientation}</span>
          </Button>

          <Button
            size="sm"
            variant="brand"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 text-xs h-8 shadow-sm font-medium"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save Template"}</span>
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 3-Panel Studio Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Tools & Elements Library Panel */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border shadow-xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Elements Library</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-foreground mb-1.5 block">
                  Add Standard Placeholders
                </span>
                <div className="grid grid-cols-1 gap-1">
                  {STANDARD_PLACEHOLDERS.slice(0, 6).map((item) => (
                    <Button
                      key={item.key}
                      variant="outline"
                      size="sm"
                      onClick={() => addField(item.key, item.label)}
                      className="justify-start text-[11px] h-7 px-2 font-normal"
                    >
                      <Plus className="h-3 w-3 mr-1.5 text-primary" />
                      <span className="truncate">{item.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-3 space-y-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addSignature}
                  className="w-full justify-start text-[11px] h-7 px-2"
                >
                  <PenTool className="h-3 w-3 mr-1.5 text-amber-500" />
                  <span>Add Signature Block</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedType("qr");
                    setSelectedId("qr_code");
                  }}
                  className="w-full justify-start text-[11px] h-7 px-2"
                >
                  <QrCode className="h-3 w-3 mr-1.5 text-primary" />
                  <span>Configure Dynamic QR</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedType("border");
                    setSelectedId("border_config");
                  }}
                  className="w-full justify-start text-[11px] h-7 px-2"
                >
                  <Palette className="h-3 w-3 mr-1.5 text-emerald-500" />
                  <span>Border & Canvas Style</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center Canvas Stage */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center bg-muted/30 p-4 border rounded-xl overflow-hidden min-h-[500px]">
          <div
            className="w-full relative shadow-lg rounded-sm overflow-hidden transition-all select-none"
            style={{
              aspectRatio: orientation === "LANDSCAPE" ? "1120 / 792" : "792 / 1120",
              backgroundColor: layout.backgroundColor || "#ffffff",
              borderColor: layout.border?.color || "#0f172a",
              borderWidth: `${layout.border?.width || 4}px`,
              borderStyle: "solid",
            }}
          >
            {/* Secondary Inner Border */}
            {layout.border?.secondaryColor && (
              <div
                className="absolute inset-2 pointer-events-none rounded-xs"
                style={{
                  borderColor: layout.border.secondaryColor,
                  borderWidth: "1.5px",
                  borderStyle: "solid",
                }}
              />
            )}

            {/* Canvas Text Fields */}
            {layout.fields.map((f) => {
              const isSelected = selectedId === f.id && !previewMode;
              let displayText = f.placeholder;

              if (previewMode) {
                const sample = STANDARD_PLACEHOLDERS.find((p) => p.key === f.placeholder);
                if (sample) displayText = sample.sample;
              }

              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setSelectedId(f.id);
                    setSelectedType("field");
                  }}
                  className={`absolute cursor-pointer transition-shadow ${
                    isSelected ? "ring-2 ring-blue-500 ring-offset-1 rounded-xs" : "hover:outline-dashed hover:outline-1 hover:outline-blue-300"
                  }`}
                  style={{
                    left: `${f.x}%`,
                    top: `${f.y}%`,
                    transform:
                      f.align === "center"
                        ? "translateX(-50%)"
                        : f.align === "right"
                        ? "translateX(-100%)"
                        : "none",
                    fontSize: `${f.fontSize * 0.42}px`,
                    fontFamily: f.fontFamily,
                    fontWeight: f.fontWeight,
                    fontStyle: f.fontStyle || "normal",
                    color: f.color,
                    textAlign: f.align,
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayText}
                </div>
              );
            })}

            {/* Signatures */}
            {layout.signatures.map((sig) => {
              const isSelected = selectedId === sig.id && !previewMode;
              return (
                <div
                  key={sig.id}
                  onClick={() => {
                    setSelectedId(sig.id);
                    setSelectedType("signature");
                  }}
                  className={`absolute text-center border-t border-slate-400 pt-1 cursor-pointer ${
                    isSelected ? "ring-2 ring-blue-500 rounded-xs" : "hover:outline-dashed hover:outline-1 hover:outline-blue-300"
                  }`}
                  style={{
                    left: `${sig.x}%`,
                    top: `${sig.y}%`,
                    width: `${sig.width * 0.75}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="text-[10px] font-semibold text-slate-800">{sig.signatoryName}</div>
                  <div className="text-[8px] text-slate-500">{sig.title}</div>
                </div>
              );
            })}

            {/* Dynamic QR Code */}
            <div
              onClick={() => {
                setSelectedId("qr_code");
                setSelectedType("qr");
              }}
              className={`absolute cursor-pointer border bg-white p-0.5 rounded ${
                selectedId === "qr_code" && !previewMode ? "ring-2 ring-blue-500" : "hover:outline-dashed hover:outline-1 hover:outline-blue-300"
              }`}
              style={{
                left: `${layout.qrCode.x}%`,
                top: `${layout.qrCode.y}%`,
                width: `${layout.qrCode.size * 0.7}px`,
                height: `${layout.qrCode.size * 0.7}px`,
                transform: "translateX(-50%) translateY(-50%)",
              }}
            >
              <div className="w-full h-full bg-slate-900/10 flex items-center justify-center text-[8px] font-mono font-bold text-slate-700">
                [QR CODE]
              </div>
            </div>
          </div>
        </div>

        {/* Right Property Inspector Panel */}
        <div className="lg:col-span-3 space-y-4">
          <Card className="border shadow-xs">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-primary" />
                  Inspector
                </span>
                {selectedType && (
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {selectedType}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-3">
              {/* Field Inspector */}
              {selectedType === "field" && selectedField ? (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Field Label / Placeholder</label>
                    <Input
                      value={selectedField.placeholder}
                      onChange={(e) => updateSelectedField({ placeholder: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium">Font Size (pt)</label>
                      <Input
                        type="number"
                        value={selectedField.fontSize}
                        onChange={(e) => updateSelectedField({ fontSize: Number(e.target.value) })}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium">Color</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="color"
                          value={selectedField.color}
                          onChange={(e) => updateSelectedField({ color: e.target.value })}
                          className="h-8 w-8 rounded border p-0.5 cursor-pointer"
                        />
                        <Input
                          value={selectedField.color}
                          onChange={(e) => updateSelectedField({ color: e.target.value })}
                          className="text-xs h-8 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Font Family</label>
                    <select
                      value={selectedField.fontFamily}
                      onChange={(e) => updateSelectedField({ fontFamily: e.target.value })}
                      className="w-full border rounded px-2 py-1.5 text-xs bg-background"
                    >
                      <option value="Georgia, serif">Georgia (Classic Serif)</option>
                      <option value="Inter, sans-serif">Inter (Modern Clean)</option>
                      <option value="'Playfair Display', serif">Playfair Display (Formal)</option>
                      <option value="monospace">Monospace (Code / ID)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Alignment</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <Button
                          key={a}
                          type="button"
                          variant={selectedField.align === a ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateSelectedField({ align: a })}
                          className="h-7 text-xs capitalize"
                        >
                          {a}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Coordinates */}
                  <div className="grid grid-cols-2 gap-2 border-t pt-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">X Position (%)</label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={selectedField.x}
                        onChange={(e) => updateSelectedField({ x: Number(e.target.value) })}
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Y Position (%)</label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={selectedField.y}
                        onChange={(e) => updateSelectedField({ y: Number(e.target.value) })}
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={removeSelectedField}
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7 gap-1 mt-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Field</span>
                  </Button>
                </div>
              ) : selectedType === "signature" && selectedSignature ? (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Signatory Name</label>
                    <Input
                      value={selectedSignature.signatoryName}
                      onChange={(e) => updateSelectedSignature({ signatoryName: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Title / Designation</label>
                    <Input
                      value={selectedSignature.title}
                      onChange={(e) => updateSelectedSignature({ title: e.target.value })}
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">X Position (%)</label>
                      <Input
                        type="number"
                        value={selectedSignature.x}
                        onChange={(e) => updateSelectedSignature({ x: Number(e.target.value) })}
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Y Position (%)</label>
                      <Input
                        type="number"
                        value={selectedSignature.y}
                        onChange={(e) => updateSelectedSignature({ y: Number(e.target.value) })}
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : selectedType === "qr" ? (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">X Position (%)</label>
                      <Input
                        type="number"
                        value={layout.qrCode.x}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            qrCode: { ...prev.qrCode, x: Number(e.target.value) },
                          }))
                        }
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Y Position (%)</label>
                      <Input
                        type="number"
                        value={layout.qrCode.y}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            qrCode: { ...prev.qrCode, y: Number(e.target.value) },
                          }))
                        }
                        className="text-xs h-7 font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">QR Code Size (px)</label>
                    <Input
                      type="number"
                      value={layout.qrCode.size}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          qrCode: { ...prev.qrCode, size: Number(e.target.value) },
                        }))
                      }
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              ) : selectedType === "border" ? (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Border Color</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={layout.border.color}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            border: { ...prev.border, color: e.target.value },
                          }))
                        }
                        className="h-8 w-8 rounded border p-0.5 cursor-pointer"
                      />
                      <Input
                        value={layout.border.color}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            border: { ...prev.border, color: e.target.value },
                          }))
                        }
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Inner Accent (Gold) Color</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={layout.border.secondaryColor || "#d97706"}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            border: { ...prev.border, secondaryColor: e.target.value },
                          }))
                        }
                        className="h-8 w-8 rounded border p-0.5 cursor-pointer"
                      />
                      <Input
                        value={layout.border.secondaryColor || "#d97706"}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            border: { ...prev.border, secondaryColor: e.target.value },
                          }))
                        }
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Background Color</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={layout.backgroundColor || "#ffffff"}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            backgroundColor: e.target.value,
                          }))
                        }
                        className="h-8 w-8 rounded border p-0.5 cursor-pointer"
                      />
                      <Input
                        value={layout.backgroundColor || "#ffffff"}
                        onChange={(e) =>
                          setLayout((prev) => ({
                            ...prev,
                            backgroundColor: e.target.value,
                          }))
                        }
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Select an element on the canvas to inspect its properties.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
