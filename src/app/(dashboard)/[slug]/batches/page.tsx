"use client";

import * as React from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Trash2,
  Download,
  ShieldAlert,
  FileCheck,
  Users,
  Eye,
  Check,
  Filter,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  Layers,
  Cpu,
  FileText,
  Clock,
  ChevronRight,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CertificateTemplateRecord } from "@/types/template";
import { BatchDiagnosticReport, ValidatedRecipientRecord } from "@/lib/services/batch-validation-service";
import { IssuanceBatchRecord } from "@/lib/repositories/batch-repository";

type WizardStep = "upload" | "mapping" | "validation" | "preview";

export default function BatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  // View mode: 'list' (Batch history) or 'wizard' (Active import process)
  const [viewMode, setViewMode] = React.useState<"list" | "wizard">("list");
  const [currentStep, setCurrentStep] = React.useState<WizardStep>("upload");

  // Batches history
  const [batches, setBatches] = React.useState<IssuanceBatchRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = React.useState<boolean>(true);

  // Templates list for mapping
  const [templates, setTemplates] = React.useState<CertificateTemplateRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");

  // Ingestion data
  const [uploadedFile, setUploadedFile] = React.useState<{ name: string; size: number } | null>(null);
  const [parsedHeaders, setParsedHeaders] = React.useState<string[]>([]);
  const [parsedRows, setParsedRows] = React.useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = React.useState<Record<string, string>>({
    recipient_name: "",
    recipient_email: "",
    course_name: "",
    issue_date: "",
    completion_date: "",
    grade: "",
    external_id: "",
    instructor_name: "",
  });
  const [suggestedMapping, setSuggestedMapping] = React.useState<Record<string, string>>({});
  const [formulaAlerts, setFormulaAlerts] = React.useState<Array<{ row: number; column: string; originalValue: string }>>([]);

  // Validation report
  const [report, setReport] = React.useState<BatchDiagnosticReport | null>(null);
  const [filterStatus, setFilterStatus] = React.useState<"ALL" | "VALID" | "INVALID" | "DUPLICATE">("ALL");
  const [batchTitle, setBatchTitle] = React.useState<string>("");

  // UI state
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);
  const [processingBatchId, setProcessingBatchId] = React.useState<string | null>(null);
  const [anchoringBatchId, setAnchoringBatchId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [selectedBatchDetails, setSelectedBatchDetails] = React.useState<IssuanceBatchRecord | null>(null);

  // Load existing batches and templates
  const loadInitialData = React.useCallback(async () => {
    setLoadingBatches(true);
    try {
      const [batchRes, tmplRes] = await Promise.all([
        fetch(`/api/v1/tenants/${slug}/batches`),
        fetch(`/api/v1/tenants/${slug}/templates`),
      ]);

      const batchJson = await batchRes.json();
      const tmplJson = await tmplRes.json();

      if (batchJson.success && batchJson.data) {
        setBatches(batchJson.data);
      }
      if (tmplJson.success && tmplJson.data) {
        setTemplates(tmplJson.data);
        if (tmplJson.data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(tmplJson.data[0].id);
        }
      }
    } catch {
      setErrorMsg("Failed to load batches or templates.");
    } finally {
      setLoadingBatches(false);
    }
  }, [slug, selectedTemplateId]);

  React.useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const fileBase64 = btoa(binary);

      const res = await fetch(`/api/v1/tenants/${slug}/batches/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          fileBase64,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to process spreadsheet file.");
      }

      setUploadedFile({ name: file.name, size: file.size });
      setParsedHeaders(json.data.headers);
      setParsedRows(json.data.rawRows);
      setSuggestedMapping(json.data.suggestedMapping);
      setFormulaAlerts(json.data.formulaInjections || []);

      // Initialize mapping with auto-detected matches
      setColumnMapping({
        recipient_name: json.data.suggestedMapping.recipient_name || "",
        recipient_email: json.data.suggestedMapping.recipient_email || "",
        course_name: json.data.suggestedMapping.course_name || "",
        issue_date: json.data.suggestedMapping.issue_date || "",
        completion_date: json.data.suggestedMapping.completion_date || "",
        grade: json.data.suggestedMapping.grade || "",
        external_id: json.data.suggestedMapping.external_id || "",
        instructor_name: json.data.suggestedMapping.instructor_name || "",
      });

      setBatchTitle(`Cohort - ${file.name.replace(/\.[^/.]+$/, "")}`);
      setCurrentStep("mapping");
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while uploading file.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Run validation
  const handleValidateBatch = async () => {
    if (!columnMapping.recipient_name || !columnMapping.recipient_email) {
      setErrorMsg("Both Recipient Name and Recipient Email must be mapped.");
      return;
    }
    if (!selectedTemplateId) {
      setErrorMsg("Please select a target certificate template.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/batches/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          headers: parsedHeaders,
          rows: parsedRows,
          columnMapping,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Batch validation failed.");
      }

      setReport(json.data);
      setCurrentStep("validation");
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred during validation.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Stage batch in DRAFT
  const handleStageBatch = async () => {
    if (!report || report.validCount === 0) {
      setErrorMsg("Cannot stage batch without valid recipient records.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/batches/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          title: batchTitle || `Batch Cohort (${report.validCount} recipients)`,
          stagedRecipients: report.rows.map((r) => ({
            fullName: r.recipientName,
            email: r.recipientEmail,
            externalIdentifier: r.externalIdentifier,
            certificateNumberPreview: r.certificateNumberPreview,
            courseName: r.courseName,
            issueDate: r.issueDate,
            completionDate: r.completionDate,
            grade: r.grade,
            instructorName: r.instructorName,
            customData: r.customData,
            status: r.status,
            errors: r.errors,
          })),
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to stage batch.");
      }

      setSuccessMsg(`Successfully staged Batch ${json.data.batchNumber} with ${json.data.validCount} valid recipients!`);
      setViewMode("list");
      setCurrentStep("upload");
      loadInitialData();
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while staging batch.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete draft batch
  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("Are you sure you want to delete this draft batch?")) return;

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/batches/${batchId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("Batch deleted successfully.");
        loadInitialData();
        if (selectedBatchDetails?.id === batchId) setSelectedBatchDetails(null);
      } else {
        setErrorMsg(json.error?.message || "Failed to delete batch.");
      }
    } catch {
      setErrorMsg("Network error deleting batch.");
    }
  };

  // Process batch: generate unique certificate numbers, QRs, PDFs and ZIP
  const handleProcessBatch = async (batchId: string) => {
    setProcessingBatchId(batchId);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/batches/${batchId}/process`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(
          `Successfully generated ${json.data.totalProcessed} certificates for Batch ${json.data.batchNumber}! Print-ready PDFs and bulk ZIP archive are ready. Claim links have been downloaded.`
        );

        if (json.data.claimLinks && json.data.claimLinks.length > 0 && typeof window !== "undefined") {
          try {
            const csvHeader = "Recipient Name,Recipient Email,Certificate Number,Claim URL\n";
            const csvRows = json.data.claimLinks
              .map(
                (c: any) =>
                  `"${(c.recipientName || "").replace(/"/g, '""')}","${(c.recipientEmail || "").replace(/"/g, '""')}","${c.certificateNumber}","${c.claimUrl}"`
              )
              .join("\n");
            const blob = new Blob([csvHeader + csvRows], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Batch_${json.data.batchNumber}_claim_links.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          } catch {
            // Non-blocking
          }
        }

        loadInitialData();
        if (selectedBatchDetails?.id === batchId) {
          setSelectedBatchDetails({
            ...selectedBatchDetails,
            status: "GENERATED",
            leafCount: json.data.totalProcessed,
          });
        }
      } else {
        setErrorMsg(json.error?.message || "Failed to generate certificates.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error generating certificates.");
    } finally {
      setProcessingBatchId(null);
    }
  };

  // Anchor batch: publish Merkle root to Ethereum Sepolia smart contract
  const handleAnchorBatch = async (batchId: string) => {
    setAnchoringBatchId(batchId);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/batches/${batchId}/anchor`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(
          `Batch successfully anchored on Ethereum Sepolia! Tx: ${json.data.onChainTxHash?.slice(0, 10)}... (Block #${json.data.blockchainBlockNumber})`
        );
        loadInitialData();
        if (selectedBatchDetails?.id === batchId) {
          setSelectedBatchDetails({
            ...selectedBatchDetails,
            status: "ANCHORED",
            onChainTxHash: json.data.onChainTxHash,
            blockchainBlockNumber: json.data.blockchainBlockNumber,
          });
        }
      } else {
        setErrorMsg(json.error?.message || "Failed to anchor batch on Sepolia.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error anchoring batch on Sepolia.");
    } finally {
      setAnchoringBatchId(null);
    }
  };

  // Download Sample CSV
  const downloadSampleCSV = () => {
    const csvContent = `Student Name,Email Address,Course Name,Issue Date,Final Grade,Student ID
Grace Hopper,grace.hopper@navy.mil,Advanced Compilers,2026-11-15,A+,GH-1906
Alan Turing,alan.turing@cambridge.ac.uk,Cryptography & Machine Learning,2026-11-15,Distinction,AT-1912
Katherine Johnson,kjohnson@nasa.gov,Orbital Mechanics & Astrodynamics,2026-11-15,A+,KJ-1918
Claude Shannon,cshannon@bell-labs.com,Information Theory & Cryptology,2026-11-15,A,CS-1916`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "credvail_recipient_sample.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metrics summary
  const stats = React.useMemo(() => {
    const total = batches.length;
    const anchored = batches.filter((b) => b.status === "ANCHORED").length;
    const generated = batches.filter((b) => b.status === "GENERATED").length;
    const totalRecipients = batches.reduce((acc, b) => acc + (b.validCount || 0), 0);
    return { total, anchored, generated, totalRecipients };
  }, [batches]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
              Spreadsheet Ingestion & Batches
            </h1>
            <Badge variant="outline" className="border-black/[0.08] bg-white text-[#475569] font-mono text-[11px] gap-1.5">
              <Sparkles className="h-3 w-3" />
              Batch Engine
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            High-volume certificate ingestion engine with RFC 4180 parsing, SEC-07 formula injection sanitization, and Merkle root anchoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {viewMode === "list" ? (
            <>
              <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="gap-2 text-xs">
                <Download className="h-3.5 w-3.5" />
                <span>Sample CSV</span>
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  setViewMode("wizard");
                  setCurrentStep("upload");
                }}
                className="gap-2 text-xs shadow-sm"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>New Spreadsheet Import</span>
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setViewMode("list");
                setCurrentStep("upload");
              }}
              className="gap-2 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Batches</span>
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-destructive flex items-center gap-3 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <Button variant="ghost" size="sm" onClick={() => setErrorMsg(null)} className="h-6 px-2 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-emerald-700 dark:text-emerald-400 flex items-center gap-3 text-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div className="flex-1 font-medium">{successMsg}</div>
          <Button variant="ghost" size="sm" onClick={() => setSuccessMsg(null)} className="h-6 px-2 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW: BATCH HISTORY LIST                                       */}
      {/* ============================================================== */}
      {viewMode === "list" && (
        <div className="space-y-6">
          {/* Executive Metrics Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Batches
                </span>
                <Layers className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold font-mono text-foreground mt-2">{stats.total}</p>
              <span className="text-[10px] text-muted-foreground">{stats.generated + stats.anchored} ready or anchored</span>
            </Card>

            <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-indigo-500/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sepolia Anchored
                </span>
                <Cpu className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-2">{stats.anchored}</p>
              <span className="text-[10px] text-muted-foreground">Immutable blockchain commitments</span>
            </Card>

            <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Recipients Processed
                </span>
                <Users className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">{stats.totalRecipients}</p>
              <span className="text-[10px] text-muted-foreground">Verifiable credentials minted</span>
            </Card>

            <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-amber-500/40 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  SEC-07 Threat Defense
                </span>
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">Active</p>
              <span className="text-[10px] text-muted-foreground">Formula sanitization enabled</span>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Institutional Issuance Batches
            </h2>
            <Button variant="ghost" size="sm" onClick={loadInitialData} disabled={loadingBatches} className="gap-2 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loadingBatches ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>

          {loadingBatches ? (
            <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
              Loading batch records...
            </div>
          ) : batches.length === 0 ? (
            <Card className="border-dashed py-16 text-center">
              <CardContent className="space-y-4">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/60" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-base">No issuance batches created yet</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Upload a recipient CSV or Excel spreadsheet to generate certificates and anchor credentials to Ethereum.
                  </p>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    setViewMode("wizard");
                    setCurrentStep("upload");
                  }}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload First Spreadsheet</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {batches.map((b) => (
                <Card key={b.id} className="hover:border-primary/50 transition-all flex flex-col justify-between shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                        {b.batchNumber}
                      </span>
                      <Badge
                        variant={
                          b.status === "ANCHORED"
                            ? "verified"
                            : b.status === "DRAFT"
                            ? "secondary"
                            : b.status === "FAILED"
                            ? "destructive"
                            : "default"
                        }
                      >
                        {b.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-base line-clamp-1 mt-2 font-bold">{b.title}</CardTitle>
                    <CardDescription className="text-xs">
                      Created on {new Date(b.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pb-3 text-xs space-y-2">
                    <div className="flex items-center justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Valid Recipients:</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        {b.validCount}
                      </span>
                    </div>
                    {b.invalidCount > 0 && (
                      <div className="flex items-center justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Skipped Rows:</span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400 font-mono">
                          {b.invalidCount}
                        </span>
                      </div>
                    )}
                    {b.merkleRoot && (
                      <div className="space-y-0.5 pt-1">
                        <span className="text-muted-foreground text-[10px] uppercase font-semibold">Merkle Root:</span>
                        <p className="font-mono text-[10px] text-muted-foreground truncate bg-muted/40 p-1 rounded" title={b.merkleRoot}>
                          {b.merkleRoot}
                        </p>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-3 border-t border-border flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedBatchDetails(b)}
                        className="gap-1.5 h-8 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View</span>
                      </Button>

                      {b.status === "DRAFT" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBatch(b.id)}
                          className="text-destructive hover:bg-destructive/10 h-8 px-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {b.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="brand"
                        onClick={() => handleProcessBatch(b.id)}
                        disabled={processingBatchId === b.id}
                        className="h-8 text-xs gap-1.5 font-medium"
                      >
                        <Sparkles className={`h-3.5 w-3.5 ${processingBatchId === b.id ? "animate-spin" : ""}`} />
                        <span>{processingBatchId === b.id ? "Generating..." : "Generate Certificates"}</span>
                      </Button>
                    )}

                    {b.status === "GENERATED" && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleAnchorBatch(b.id)}
                          disabled={anchoringBatchId === b.id}
                          className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                        >
                          <ShieldCheck className={`h-3.5 w-3.5 ${anchoringBatchId === b.id ? "animate-spin" : ""}`} />
                          <span>{anchoringBatchId === b.id ? "Anchoring..." : "Anchor to Sepolia"}</span>
                        </Button>
                        <a href={`/api/v1/tenants/${slug}/batches/${b.id}/download-zip`} target="_blank" rel="noreferrer">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-medium"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>ZIP</span>
                          </Button>
                        </a>
                      </div>
                    )}

                    {b.status === "ANCHORED" && (
                      <div className="flex items-center gap-1.5">
                        {b.onChainTxHash && (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${b.onChainTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Sepolia Tx</span>
                          </a>
                        )}
                        <a href={`/api/v1/tenants/${slug}/batches/${b.id}/download-zip`} target="_blank" rel="noreferrer">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 font-medium"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>ZIP</span>
                          </Button>
                        </a>
                      </div>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}

          {/* Details Modal */}
          {selectedBatchDetails && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in-50 zoom-in-95">
                <CardHeader className="border-b border-border pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-bold">{selectedBatchDetails.title}</CardTitle>
                      <CardDescription className="font-mono text-xs mt-0.5">
                        Batch: {selectedBatchDetails.batchNumber} • Status: {selectedBatchDetails.status}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedBatchDetails(null)} className="h-8 w-8 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="overflow-y-auto p-6 space-y-4 flex-1 text-xs">
                  <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl border border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Valid Recipients</p>
                      <p className="text-xl font-bold font-mono text-foreground">{selectedBatchDetails.validCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Creation Timestamp</p>
                      <p className="text-xs font-medium text-foreground mt-1">{new Date(selectedBatchDetails.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedBatchDetails.merkleRoot && (
                    <div className="space-y-1">
                      <span className="font-semibold text-foreground">32-Byte Keccak-256 Merkle Root</span>
                      <p className="p-2.5 rounded bg-muted font-mono text-[11px] break-all border border-border">
                        {selectedBatchDetails.merkleRoot}
                      </p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold mb-2">Staged Recipients Sample</h4>
                    {selectedBatchDetails.stagedRecipients && selectedBatchDetails.stagedRecipients.length > 0 ? (
                      <div className="border border-border rounded-lg overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-muted text-muted-foreground uppercase text-[10px]">
                            <tr>
                              <th className="p-2.5">Name</th>
                              <th className="p-2.5">Email</th>
                              <th className="p-2.5">Certificate Preview</th>
                              <th className="p-2.5">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {selectedBatchDetails.stagedRecipients.slice(0, 15).map((r, i) => (
                              <tr key={i} className="hover:bg-muted/30">
                                <td className="p-2.5 font-medium">{r.fullName}</td>
                                <td className="p-2.5 font-mono text-muted-foreground">{r.email}</td>
                                <td className="p-2.5 font-mono text-primary font-bold">{r.certificateNumberPreview}</td>
                                <td className="p-2.5">
                                  <Badge variant={r.status === "VALID" ? "default" : "secondary"}>
                                    {r.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No individual recipient records cached.</p>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="border-t border-border p-4 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedBatchDetails(null)} className="text-xs">
                    Close
                  </Button>

                  <div className="flex items-center gap-2">
                    {selectedBatchDetails.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="brand"
                        onClick={() => handleProcessBatch(selectedBatchDetails.id)}
                        disabled={processingBatchId === selectedBatchDetails.id}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        <Sparkles className={`h-3.5 w-3.5 ${processingBatchId === selectedBatchDetails.id ? "animate-spin" : ""}`} />
                        <span>{processingBatchId === selectedBatchDetails.id ? "Generating..." : "Generate Certificates"}</span>
                      </Button>
                    )}

                    {(selectedBatchDetails.status === "GENERATED" || selectedBatchDetails.status === "ANCHORED") && (
                      <>
                        <Link href={`/${slug}/certificates`}>
                          <Button size="sm" variant="outline" className="text-xs">
                            View in Registry
                          </Button>
                        </Link>
                        {selectedBatchDetails.status === "GENERATED" && (
                          <Button
                            size="sm"
                            onClick={() => handleAnchorBatch(selectedBatchDetails.id)}
                            disabled={anchoringBatchId === selectedBatchDetails.id}
                            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                          >
                            <ShieldCheck className={`h-3.5 w-3.5 ${anchoringBatchId === selectedBatchDetails.id ? "animate-spin" : ""}`} />
                            <span>{anchoringBatchId === selectedBatchDetails.id ? "Anchoring..." : "Anchor to Sepolia"}</span>
                          </Button>
                        )}
                        {selectedBatchDetails.status === "ANCHORED" && selectedBatchDetails.onChainTxHash && (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${selectedBatchDetails.onChainTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Sepolia Explorer</span>
                          </a>
                        )}
                        <a
                          href={`/api/v1/tenants/${slug}/batches/${selectedBatchDetails.id}/download-zip`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" className="gap-1.5 text-xs">
                            <Download className="h-3.5 w-3.5" />
                            <span>Download ZIP</span>
                          </Button>
                        </a>
                      </>
                    )}
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW: INGESTION & VALIDATION WIZARD                           */}
      {/* ============================================================== */}
      {viewMode === "wizard" && (
        <div className="space-y-6">
          {/* Wizard Step Indicator */}
          <div className="grid grid-cols-4 gap-2 sm:gap-4 border-b border-border pb-4">
            {[
              { id: "upload", label: "1. Upload File" },
              { id: "mapping", label: "2. Column Mapping" },
              { id: "validation", label: "3. Diagnostics" },
              { id: "preview", label: "4. Stage Batch" },
            ].map((step) => {
              const isActive = currentStep === step.id;
              const isPast =
                (step.id === "upload" && currentStep !== "upload") ||
                (step.id === "mapping" && (currentStep === "validation" || currentStep === "preview")) ||
                (step.id === "validation" && currentStep === "preview");

              return (
                <div
                  key={step.id}
                  className={`text-center pb-2 border-b-2 font-medium text-xs sm:text-sm transition-colors ${
                    isActive
                      ? "border-primary text-primary font-bold"
                      : isPast
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-muted-foreground"
                  }`}
                >
                  {step.label}
                </div>
              );
            })}
          </div>

          {/* STEP 1: UPLOAD */}
          {currentStep === "upload" && (
            <div className="space-y-6">
              <Card className="border shadow-xs">
                <CardHeader>
                  <CardTitle className="text-xl">Upload Recipient Spreadsheet</CardTitle>
                  <CardDescription>
                    Supports standard CSV, TSV, or Excel (.xlsx) files. All cell strings are sanitized against formula injection (SEC-07).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="border-2 border-dashed border-border hover:border-primary/60 rounded-2xl p-12 text-center flex flex-col items-center justify-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
                    onClick={() => document.getElementById("spreadsheet-file-input")?.click()}
                  >
                    <input
                      id="spreadsheet-file-input"
                      type="file"
                      accept=".csv, .tsv, .xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    <Upload className="h-12 w-12 text-primary/70 mb-4 animate-bounce" />
                    <p className="font-semibold text-foreground text-base">
                      Click to browse or drag and drop your spreadsheet
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Accepts CSV, TSV, and Excel OpenXML (.xlsx) up to 15MB
                    </p>
                  </div>

                  {/* SEC-07 Callout */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p className="font-semibold text-foreground">SEC-07 Threat Defense: Formula Injection Sanitization</p>
                      <p>
                        Any cells starting with dangerous dynamic execution characters (<code className="font-mono text-primary">=</code>, <code className="font-mono text-primary">+</code>, <code className="font-mono text-primary">-</code>, <code className="font-mono text-primary">@</code>, tab, or carriage return) are automatically sanitized with leading quote escapes before parsing or rendering.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING */}
          {currentStep === "mapping" && (
            <div className="space-y-6">
              <Card className="border shadow-xs">
                <CardHeader>
                  <CardTitle className="text-xl">Map Spreadsheet Columns to Certificate Fields</CardTitle>
                  <CardDescription>
                    Link detected spreadsheet columns to certificate template dynamic placeholders.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Template Picker */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Target Certificate Template</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.category}) {t.isDefault ? "— [Default]" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Mapping Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                    {/* Recipient Name (Required) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">
                          Recipient Full Name <span className="text-destructive">*</span>
                        </label>
                        {columnMapping.recipient_name && suggestedMapping.recipient_name === columnMapping.recipient_name && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.recipient_name}
                        onChange={(e) => setColumnMapping({ ...columnMapping, recipient_name: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Select Column --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Recipient Email (Required) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">
                          Recipient Email <span className="text-destructive">*</span>
                        </label>
                        {columnMapping.recipient_email && suggestedMapping.recipient_email === columnMapping.recipient_email && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.recipient_email}
                        onChange={(e) => setColumnMapping({ ...columnMapping, recipient_email: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Select Column --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Course Name */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">Course / Program Name</label>
                        {columnMapping.course_name && suggestedMapping.course_name === columnMapping.course_name && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.course_name}
                        onChange={(e) => setColumnMapping({ ...columnMapping, course_name: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Optional: Uses Template Default --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Grade / Honor */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">Final Grade / Honor</label>
                        {columnMapping.grade && suggestedMapping.grade === columnMapping.grade && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.grade}
                        onChange={(e) => setColumnMapping({ ...columnMapping, grade: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Optional --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Student ID */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">External / Student ID</label>
                        {columnMapping.external_id && suggestedMapping.external_id === columnMapping.external_id && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.external_id}
                        onChange={(e) => setColumnMapping({ ...columnMapping, external_id: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Optional --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Issue Date */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase text-foreground">Issue Date</label>
                        {columnMapping.issue_date && suggestedMapping.issue_date === columnMapping.issue_date && (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/40">
                            Auto-matched
                          </Badge>
                        )}
                      </div>
                      <select
                        value={columnMapping.issue_date}
                        onChange={(e) => setColumnMapping({ ...columnMapping, issue_date: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">-- Optional: Uses Today's Date --</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Sample Parsed Row */}
                  <div className="space-y-2 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Sample Parsed Row (Row 1):</p>
                    <div className="p-3 bg-muted/30 rounded-lg font-mono text-xs overflow-x-auto">
                      {parsedRows.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(parsedRows[0]).map(([col, val]) => (
                            <div key={col} className="truncate">
                              <span className="text-muted-foreground">{col}: </span>
                              <span className="text-foreground font-semibold">{val || "—"}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>No rows parsed</span>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t border-border pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCurrentStep("upload")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  <Button variant="brand" onClick={handleValidateBatch} disabled={isProcessing} className="gap-2">
                    <span>{isProcessing ? "Validating..." : "Validate Records"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* STEP 3: DIAGNOSTICS */}
          {currentStep === "validation" && report && (
            <div className="space-y-6">
              {/* Metric Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="bg-emerald-500/5 border-emerald-500/20 p-4">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase block">
                    Valid Records
                  </span>
                  <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    {report.validCount}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Ready for issuance</span>
                </Card>

                <Card className="bg-amber-500/5 border-amber-500/20 p-4">
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase block">
                    Duplicate Rows
                  </span>
                  <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                    {report.duplicateCount}
                  </p>
                  <span className="text-[10px] text-muted-foreground">In-file or existing email</span>
                </Card>

                <Card className="bg-destructive/5 border-destructive/20 p-4">
                  <span className="text-xs text-destructive font-semibold uppercase block">
                    Invalid Rows
                  </span>
                  <p className="text-2xl font-bold font-mono text-destructive mt-1">
                    {report.invalidCount}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Missing or bad data</span>
                </Card>

                <Card className="bg-primary/5 border-primary/20 p-4">
                  <span className="text-xs text-primary font-semibold uppercase block">
                    Security Alerts
                  </span>
                  <p className="text-2xl font-bold font-mono text-primary mt-1">
                    {report.securityAlertCount}
                  </p>
                  <span className="text-[10px] text-muted-foreground">Formulas neutralized</span>
                </Card>
              </div>

              {/* Diagnostic Table */}
              <Card className="border shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Recipient Diagnostics Log</CardTitle>
                      <CardDescription className="text-xs">
                        Review individual row validation statuses before finalizing draft batch.
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(["ALL", "VALID", "INVALID", "DUPLICATE"] as const).map((st) => (
                        <Button
                          key={st}
                          variant={filterStatus === st ? "default" : "outline"}
                          size="sm"
                          onClick={() => setFilterStatus(st)}
                          className="h-7 text-xs px-2.5"
                        >
                          {st}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="border-t border-border overflow-x-auto max-h-[350px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted text-muted-foreground uppercase sticky top-0 text-[10px]">
                        <tr>
                          <th className="p-2.5">Row</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Recipient Name</th>
                          <th className="p-2.5">Email Address</th>
                          <th className="p-2.5">Certificate Preview</th>
                          <th className="p-2.5">Diagnostic Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.rows
                          .filter((r) => filterStatus === "ALL" || r.status === filterStatus)
                          .map((r, i) => (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="p-2.5 font-mono text-muted-foreground">{r.rowIndex}</td>
                              <td className="p-2.5">
                                <Badge
                                  variant={
                                    r.status === "VALID"
                                      ? "verified"
                                      : r.status === "DUPLICATE"
                                      ? "warning"
                                      : "destructive"
                                  }
                                >
                                  {r.status}
                                </Badge>
                              </td>
                              <td className="p-2.5 font-medium">
                                <span className={r.isFormulaSanitized ? "text-primary font-mono" : ""}>
                                  {r.recipientName || "—"}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-muted-foreground">{r.recipientEmail || "—"}</td>
                              <td className="p-2.5 font-mono text-[11px] font-bold text-primary">{r.certificateNumberPreview}</td>
                              <td className="p-2.5 text-muted-foreground">
                                {r.errors.length > 0 ? (
                                  <span className="text-destructive font-medium">
                                    {r.errors.map((e) => e.message).join("; ")}
                                  </span>
                                ) : r.isFormulaSanitized ? (
                                  <span className="text-primary font-medium">SEC-07: Formula prefix escaped</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400">Validated</span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>

                <CardFooter className="flex justify-between border-t border-border pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCurrentStep("mapping")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Mapping
                  </Button>
                  <Button
                    variant="brand"
                    onClick={() => setCurrentStep("preview")}
                    disabled={!report.summary.canProceed}
                    className="gap-2"
                  >
                    <span>Proceed to Preview</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}

          {/* STEP 4: PREVIEW & STAGE */}
          {currentStep === "preview" && report && (
            <div className="space-y-6">
              <Card className="border shadow-xs">
                <CardHeader>
                  <CardTitle className="text-xl">Stage Batch & Preview Credentials</CardTitle>
                  <CardDescription>
                    Review batch metadata and preview how certificates will render with collision-safe numbering.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Batch Title Input */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Batch Identification Title</label>
                    <Input
                      value={batchTitle}
                      onChange={(e) => setBatchTitle(e.target.value)}
                      placeholder="e.g. 2026 Graduating Honors Cohort"
                      className="max-w-md text-xs"
                    />
                  </div>

                  {/* Sample Certificate Swatch */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">
                      Sample Generated Credential Preview:
                    </label>
                    {report.rows.filter((r) => r.status === "VALID").length > 0 ? (
                      <div className="border border-border rounded-xl p-6 bg-gradient-to-br from-card to-muted/40 shadow-sm max-w-2xl space-y-4">
                        <div className="flex justify-between items-start border-b border-border pb-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                              CREDVAIL CERTIFICATE OF RECOGNITION
                            </span>
                            <h3 className="font-serif text-2xl font-bold mt-1 text-foreground">
                              {report.rows.find((r) => r.status === "VALID")?.recipientName}
                            </h3>
                          </div>
                          <Badge variant="outline" className="font-mono text-xs">
                            {report.rows.find((r) => r.status === "VALID")?.certificateNumberPreview}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Program / Course:</span>
                            <p className="font-semibold text-foreground">
                              {report.rows.find((r) => r.status === "VALID")?.courseName || "General Certification"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Date of Issuance:</span>
                            <p className="font-semibold text-foreground">
                              {report.rows.find((r) => r.status === "VALID")?.issueDate}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No valid records to preview.</p>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex justify-between border-t border-border pt-4">
                  <Button variant="outline" size="sm" onClick={() => setCurrentStep("validation")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Diagnostics
                  </Button>
                  <Button
                    variant="brand"
                    onClick={handleStageBatch}
                    disabled={isProcessing || report.validCount === 0}
                    className="gap-2 font-semibold"
                  >
                    <span>{isProcessing ? "Staging Batch..." : `Stage Batch (${report.validCount} Valid Recipients)`}</span>
                    <Check className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
