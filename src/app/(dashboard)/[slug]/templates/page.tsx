"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Plus,
  Eye,
  Trash2,
  Edit3,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  X,
  Palette,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CertificateTemplateRecord, TemplateCategory } from "@/types/template";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

const CATEGORY_NAMES: Record<TemplateCategory, string> = {
  COURSE_COMPLETION: "Course Completion",
  EVENT_PARTICIPATION: "Event Participation",
  INTERNSHIP_COMPLETION: "Internship",
  TRAINING_COMPLETION: "Professional Training",
  ACHIEVEMENT: "Achievement",
  APPRECIATION: "Appreciation",
  MEMBERSHIP: "Membership",
  WORKSHOP_ATTENDANCE: "Workshop",
  COMPETITION_PARTICIPATION: "Competition",
  CUSTOM: "Custom",
};

export default function TemplatesListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [templates, setTemplates] = React.useState<CertificateTemplateRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");

  // Preset Picker Modal state
  const [presetModalOpen, setPresetModalOpen] = React.useState<boolean>(false);
  const [creatingFromPreset, setCreatingFromPreset] = React.useState<boolean>(false);

  // Quick Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = React.useState<boolean>(false);
  const [previewData, setPreviewData] = React.useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      loadTemplates(p.slug);
    });
  }, [params]);

  const loadTemplates = async (tenantSlug: string, categoryFilter?: string) => {
    try {
      setLoading(true);
      setError(null);
      const url =
        categoryFilter && categoryFilter !== "ALL"
          ? `/api/v1/tenants/${tenantSlug}/templates?category=${categoryFilter}`
          : `/api/v1/tenants/${tenantSlug}/templates`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    loadTemplates(slug, category);
  };

  const handleCreateFromPreset = async (presetKey: TemplateCategory) => {
    try {
      setCreatingFromPreset(true);
      setError(null);

      const preset = TEMPLATE_PRESETS[presetKey];
      const res = await fetch(`/api/v1/tenants/${slug}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: preset.title,
          description: preset.description,
          category: preset.category,
          layoutConfig: preset.layoutConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create template from preset");

      setSuccessMsg(`Created '${preset.title}' from standard preset.`);
      setPresetModalOpen(false);
      loadTemplates(slug, selectedCategory);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingFromPreset(false);
    }
  };

  const handleDelete = async (templateId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete template '${title}'?`)) return;

    try {
      setError(null);
      const res = await fetch(`/api/v1/tenants/${slug}/templates/${templateId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to delete template");
      }

      setSuccessMsg(`Template '${title}' deleted.`);
      loadTemplates(slug, selectedCategory);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleQuickPreview = async (templateId: string) => {
    try {
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      setPreviewData(null);

      const res = await fetch(`/api/v1/tenants/${slug}/templates/${templateId}/preview`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Preview generation failed");
      setPreviewData(data.data);
    } catch (err: any) {
      setError(err.message);
      setPreviewModalOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certificate Template Designer</h1>
          <p className="text-xs text-muted-foreground">
            Visual vector certificate designer supporting dynamic placeholders, custom borders, and dynamic QR positioning.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPresetModalOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Preset Library (10)</span>
          </Button>

          <Link href={`/${slug}/templates/new`}>
            <Button size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Template</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none text-xs">
        <Button
          variant={selectedCategory === "ALL" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs rounded-full"
          onClick={() => handleCategoryChange("ALL")}
        >
          All Categories
        </Button>
        {Object.entries(CATEGORY_NAMES).map(([cat, label]) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs rounded-full shrink-0"
            onClick={() => handleCategoryChange(cat)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-72 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="border shadow-xs text-center p-12 space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold">No Templates Found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Start by choosing one of the 10 pre-engineered W3C-compatible certificate presets or create a custom canvas from scratch.
            </p>
          </div>
          <Button size="sm" onClick={() => setPresetModalOpen(true)} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span>Browse 10 Presets</span>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tmpl) => {
            const borderCol = tmpl.layoutConfig.border?.color || "#0f172a";
            const secondaryCol = tmpl.layoutConfig.border?.secondaryColor || "#d97706";
            const fieldsCount = tmpl.layoutConfig.fields?.length || 0;
            const sigCount = tmpl.layoutConfig.signatures?.length || 0;

            return (
              <Card
                key={tmpl.id}
                className="border shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div>
                  {/* Thumbnail Preview Area */}
                  <div
                    className="h-40 bg-muted/20 border-b p-3 flex flex-col justify-between relative overflow-hidden"
                    style={{ backgroundColor: tmpl.layoutConfig.backgroundColor || "#ffffff" }}
                  >
                    <div
                      className="absolute inset-2 rounded border pointer-events-none"
                      style={{ borderColor: borderCol, borderWidth: "2px" }}
                    />
                    <div
                      className="absolute inset-3 rounded border pointer-events-none"
                      style={{ borderColor: secondaryCol, borderWidth: "1px" }}
                    />

                    <div className="relative z-10 flex items-center justify-between">
                      <Badge variant="outline" className="text-[9px] bg-background/80 font-mono">
                        {CATEGORY_NAMES[tmpl.category] || tmpl.category}
                      </Badge>
                      {tmpl.isDefault && (
                        <Badge variant="verified" className="text-[9px]">
                          Default
                        </Badge>
                      )}
                    </div>

                    <div className="relative z-10 text-center my-auto px-4">
                      <div
                        className="text-xs font-bold truncate"
                        style={{ color: borderCol }}
                      >
                        {tmpl.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground italic truncate">
                        {"{{recipient_name}}"}
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                      <span>{fieldsCount} fields</span>
                      <span>{sigCount} signatures</span>
                    </div>
                  </div>

                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-bold truncate">{tmpl.title}</CardTitle>
                    <CardDescription className="text-xs line-clamp-2">
                      {tmpl.description || "Reusable template ready for batch CSV/XLSX generation."}
                    </CardDescription>
                  </CardHeader>
                </div>

                <CardFooter className="p-4 pt-2 border-t bg-muted/10 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleQuickPreview(tmpl.id)}
                    >
                      <Eye className="h-3 w-3" />
                      <span>Preview</span>
                    </Button>
                    <Link href={`/${slug}/templates/${tmpl.id}`}>
                      <Button variant="default" size="sm" className="h-7 text-xs gap-1">
                        <Edit3 className="h-3 w-3" />
                        <span>Edit Canvas</span>
                      </Button>
                    </Link>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                    onClick={() => handleDelete(tmpl.id, tmpl.title)}
                    title="Delete Template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preset Library Selection Modal */}
      {presetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-4xl max-h-[85vh] border shadow-xl flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between p-5 pb-3 border-b">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Choose from 10 Professional Presets</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Each preset comes with calibrated coordinates, typography, and standard placeholders.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPresetModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(TEMPLATE_PRESETS) as TemplateCategory[]).map((key) => {
                const p = TEMPLATE_PRESETS[key];

                return (
                  <div
                    key={key}
                    className="border rounded-xl p-4 flex flex-col justify-between hover:border-primary hover:shadow-xs transition-all bg-card"
                  >
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-foreground">{p.title}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {CATEGORY_NAMES[key]}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{p.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {p.layoutConfig.fields.length} placeholders • QR + 2 Signatures
                      </span>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleCreateFromPreset(key)}
                        disabled={creatingFromPreset}
                      >
                        Use Preset
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Real-Time Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] border shadow-2xl flex flex-col overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-bold">Vector PDF / SVG Certificate Preview</CardTitle>
                <Badge variant="outline" className="text-[10px] font-mono">
                  Sample Data Rendered
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPreviewModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="p-6 overflow-y-auto flex items-center justify-center bg-muted/40 min-h-[420px]">
              {previewLoading ? (
                <div className="text-center text-xs text-muted-foreground animate-pulse">
                  Generating dynamic vector preview and rendering QR code...
                </div>
              ) : previewData ? (
                <div
                  className="w-full max-w-2xl bg-white text-slate-900 rounded-lg shadow-md p-8 relative overflow-hidden select-none"
                  style={{
                    aspectRatio: "1120 / 792",
                    backgroundColor: previewData.backgroundColor || "#ffffff",
                    borderColor: previewData.border?.color || "#0f172a",
                    borderWidth: `${previewData.border?.width || 4}px`,
                    borderStyle: "solid",
                  }}
                >
                  {/* Inner secondary border */}
                  {previewData.border?.secondaryColor && (
                    <div
                      className="absolute inset-2 rounded border pointer-events-none"
                      style={{
                        borderColor: previewData.border.secondaryColor,
                        borderWidth: "1.5px",
                      }}
                    />
                  )}

                  {/* Rendered Text Fields */}
                  {previewData.resolvedFields?.map((f: any) => (
                    <div
                      key={f.id}
                      className="absolute"
                      style={{
                        left: `${f.x}%`,
                        top: `${f.y}%`,
                        transform:
                          f.align === "center"
                            ? "translateX(-50%)"
                            : f.align === "right"
                            ? "translateX(-100%)"
                            : "none",
                        fontSize: `${f.fontSize * 0.45}px`,
                        fontFamily: f.fontFamily,
                        fontWeight: f.fontWeight,
                        fontStyle: f.fontStyle || "normal",
                        color: f.color,
                        textAlign: f.align,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.text}
                    </div>
                  ))}

                  {/* Signatures */}
                  {previewData.signatures?.map((sig: any) => (
                    <div
                      key={sig.id}
                      className="absolute text-center border-t border-slate-400 pt-1"
                      style={{
                        left: `${sig.x}%`,
                        top: `${sig.y}%`,
                        width: "120px",
                        transform: "translateX(-50%)",
                      }}
                    >
                      <div className="text-[10px] font-semibold text-slate-800">{sig.signatoryName}</div>
                      <div className="text-[8px] text-slate-500">{sig.title}</div>
                    </div>
                  ))}

                  {/* Dynamic QR Code */}
                  {previewData.qrCode?.dataUrl && (
                    <div
                      className="absolute"
                      style={{
                        left: `${previewData.qrCode.x}%`,
                        top: `${previewData.qrCode.y}%`,
                        transform: "translateX(-50%) translateY(-50%)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewData.qrCode.dataUrl}
                        alt="Verification QR"
                        className="h-16 w-16 rounded border bg-white p-0.5"
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
