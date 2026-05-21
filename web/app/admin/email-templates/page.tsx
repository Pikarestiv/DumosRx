"use client";

import { useEffect, useState, useRef } from "react";
import { webApiClient } from "@/lib/api/client";
import {
  Mail,
  Save,
  Eye,
  Code,
  Info,
  Loader2,
  Check,
  Sparkles,
  ArrowRight,
  Monitor,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface EmailTemplate {
  id: number;
  key: string;
  name: string;
  subject: string;
  content: string;
  variables: Array<{ name: string; description: string }>;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [_activeTab, setActiveTab] = useState("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await webApiClient.request<any>("admin/email-templates");
      if (response.success) {
        setTemplates(response.templates);
        if (response.templates.length > 0) {
          loadTemplateDetails(response.templates[0].id);
        }
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load email templates");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (id: number) => {
    try {
      const response = await webApiClient.request<any>(
        `admin/email-templates/${id}`,
      );
      if (response.success) {
        const fullTemplate = response.template;
        setSelectedTemplate(fullTemplate);
        setSubject(fullTemplate.subject);
        setContent(fullTemplate.content);
      }
    } catch (error) {
      console.error("Error loading template details:", error);
      toast.error("Failed to load template details");
    }
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const response = await webApiClient.request<any>(
        `admin/email-templates/${selectedTemplate.id}`,
        {
          method: "PUT",
          body: { subject, content },
        },
      );
      if (response.success) {
        toast.success(`${selectedTemplate.name} updated successfully!`);
        // Refresh template list to update subject preview
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === selectedTemplate.id ? { ...t, subject } : t,
          ),
        );
        setSelectedTemplate(response.template);
      }
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save email template");
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variableName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const currentVal = content;

    const newVal =
      currentVal.substring(0, startPos) +
      variableName +
      currentVal.substring(endPos);
    setContent(newVal);

    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd =
        startPos + variableName.length;
    }, 0);
  };

  // Compile mock data for live rendering
  const getCompiledPreview = () => {
    if (!selectedTemplate) return "";

    let preview = content;

    // Remove extends & layout tags for visual beauty inside sandbox
    preview = preview.replace(/@extends\('[^']+'\)/g, "");
    preview = preview.replace(/@section\('[^']+'\)/g, "");
    preview = preview.replace(/@endsection/g, "");

    // Mock variable values
    const mocks: Record<string, string> = {
      "\\$user->first_name": "Dr. Aminu",
      "\\$user->email": "owner@examplepharmacy.com",
      "\\$storeName": "Apex Care Pharmacy",
      "\\$loginUrl": "#",
      "\\$resetUrl": "#",
      "\\$messageText":
        "<p>Your DumosRx cloud database storage has reached 85% capacity. We recommend optimizing old records or upgrading your subscription tier to avoid data ingress disruptions.</p>",
    };

    // Replace dynamic variables with mock data
    Object.entries(mocks).forEach(([key, val]) => {
      // Handle escaped variations
      const rawRegex = new RegExp(
        `{{\\s*${key.replace("\\$", "\\$")}\\s*}}`,
        "g",
      );
      const unescapedRegex = new RegExp(
        `{{\\s*${key.replace("\\$", "")}\\s*}}`,
        "g",
      );
      const rawHtmlRegex = new RegExp(
        `{!!\\s*${key.replace("\\$", "\\$")}\\s*!!}`,
        "g",
      );
      const unescapedRawHtmlRegex = new RegExp(
        `{!!\\s*${key.replace("\\$", "")}\\s*!!}`,
        "g",
      );

      preview = preview.replace(rawRegex, val);
      preview = preview.replace(unescapedRegex, val);
      preview = preview.replace(rawHtmlRegex, val);
      preview = preview.replace(unescapedRawHtmlRegex, val);
    });

    // Clean up unresolved blade statements
    preview = preview.replace(/{!!/g, "").replace(/!!}/g, "");
    preview = preview.replace(/{{/g, "").replace(/}}/g, "");

    // Inject into master template skeleton styling
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            background-color: #f3f4f6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
          }
          .main {
            background-color: #ffffff;
            margin: 0 auto;
            max-width: 600px;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            border: 1px solid #e5e7eb;
          }
          .header {
            padding: 20px;
            text-align: center;
            background-color: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
          }
          .header h1 {
            margin: 0;
            color: #4f46e5;
            font-size: 22px;
            font-weight: 700;
          }
          .content {
            padding: 30px;
            color: #374151;
            line-height: 1.6;
            font-size: 15px;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #6b7280;
            font-size: 12px;
            background-color: #f9fafb;
            border-top: 1px solid #e5e7eb;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #4f46e5;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 15px 0;
            text-align: center;
          }
          h2 {
            color: #111827;
            font-size: 18px;
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <div class="main">
          <div class="header">
            <h1>DumosRx</h1>
          </div>
          <div class="content">
            ${preview}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} DumosRx Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight bg-linear-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent flex items-center gap-2">
          <Mail className="h-8 w-8 text-indigo-500" />
          System Email Templates
        </h1>
        <p className="text-slate-400 font-bold mt-1">
          Customize responsive system emails, transactional logs, and
          notification alerts on the fly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left pane: Template List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-lg font-black text-white">
                System Templates
              </CardTitle>
              <CardDescription className="text-slate-400 font-bold">
                Select a template to configure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-4">
              {templates.map((t) => {
                const isSelected = selectedTemplate?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => loadTemplateDetails(t.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500 text-white"
                        : "bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl ${isSelected ? "bg-indigo-500 text-white" : "bg-slate-900 text-slate-400"}`}
                    >
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm">{t.name}</p>
                      <p className="text-xs font-semibold text-slate-500 truncate mt-0.5">
                        {t.subject}
                      </p>
                    </div>
                    <ArrowRight
                      className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? "translate-x-1 text-indigo-400" : "text-slate-600"}`}
                    />
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Alert Box */}
          <Card className="bg-amber-500/5 border-amber-500/15 backdrop-blur-xl">
            <CardContent className="p-5 flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-black text-amber-200">
                  Safe Sandbox Fallback
                </h4>
                <p className="text-xs text-amber-400/80 font-bold mt-1 leading-relaxed">
                  These templates utilize dynamic parsing. If you make a
                  rendering syntax error, the system will fall back
                  automatically to the secure local Blade views.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right pane: Editor & Sandbox */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl shadow-2xl flex flex-col h-full">
              <CardHeader className="border-b border-slate-800 flex flex-row items-center justify-between pb-6 flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-black text-white">
                      {selectedTemplate.name}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="bg-indigo-500/10 border-indigo-500/20 text-indigo-400 font-bold"
                    >
                      {selectedTemplate.key}
                    </Badge>
                  </div>
                  <CardDescription className="text-slate-400 font-bold mt-1">
                    Configure layout, message structures, and custom subject
                    lines.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700 font-black rounded-2xl px-6 h-11 shadow-lg shadow-indigo-600/20"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </CardHeader>

              <Tabs
                defaultValue="edit"
                className="flex-1 flex flex-col"
                onValueChange={setActiveTab}
              >
                <div className="px-6 py-4 bg-slate-950/20 border-b border-slate-800 flex items-center justify-between">
                  <TabsList className="bg-slate-900 border border-slate-800 rounded-xl p-1">
                    <TabsTrigger
                      value="edit"
                      className="rounded-lg font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
                    >
                      <Code className="h-4 w-4 mr-2" />
                      Code Editor
                    </TabsTrigger>
                    <TabsTrigger
                      value="preview"
                      className="rounded-lg font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Live Sandbox
                    </TabsTrigger>
                  </TabsList>

                  <Badge
                    variant="outline"
                    className="bg-slate-900/60 border-slate-800 text-slate-400 py-1.5 px-3 rounded-lg font-semibold flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3 w.5 text-indigo-400 animate-pulse" />
                    Interactive Sandbox Engine
                  </Badge>
                </div>

                <TabsContent
                  value="edit"
                  className="p-6 space-y-6 flex-1 m-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-300 uppercase tracking-widest">
                      Email Subject Line
                    </label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="bg-slate-950/50 border-slate-800 rounded-xl h-11 font-bold text-white focus-visible:ring-indigo-500"
                      placeholder="Enter email subject line"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Text Editor area */}
                    <div className="md:col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-300 uppercase tracking-widest">
                          HTML / Blade Content
                        </label>
                        <span className="text-[10px] text-slate-500 font-bold">
                          Standard Blade tags & HTML supported
                        </span>
                      </div>
                      <Textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="bg-slate-950/50 border-slate-800 rounded-2xl h-[420px] font-mono text-sm leading-relaxed p-5 text-indigo-100 focus-visible:ring-indigo-500 border focus:border-indigo-500/20"
                        placeholder="Write template HTML/Blade here..."
                      />
                    </div>

                    {/* Variables Helper area */}
                    <div className="md:col-span-1 space-y-4">
                      <Card className="bg-slate-950/50 border-slate-850 h-full">
                        <CardHeader className="pb-3 border-b border-slate-800">
                          <CardTitle className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Info className="h-4 w-4 text-indigo-400" />
                            Dynamic Injectors
                          </CardTitle>
                          <CardDescription className="text-[10px] text-slate-500 font-bold leading-relaxed">
                            Click on any dynamic token to inject it into your
                            editor content at the cursor's current position.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                          {selectedTemplate.variables.map((v, i) => (
                            <button
                              key={i}
                              onClick={() => insertVariable(`{{ ${v.name} }}`)}
                              className="w-full text-left p-3 bg-slate-900 hover:bg-indigo-600/10 rounded-xl border border-slate-800 hover:border-indigo-500/20 transition-all group"
                            >
                              <div className="flex items-center justify-between">
                                <code className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                                  {v.name}
                                </code>
                                <Check className="h-3 w-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <p className="text-[10px] text-slate-500 group-hover:text-slate-400 font-medium mt-1 leading-relaxed">
                                {v.description}
                              </p>
                            </button>
                          ))}
                          {selectedTemplate.variables.length === 0 && (
                            <div className="text-center py-6 text-slate-600 italic text-xs font-medium">
                              No special variables required
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="preview"
                  className="p-6 m-0 flex-1 flex flex-col focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <div className="space-y-4 flex-1 flex flex-col min-h-[460px]">
                    <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Active Subject Header
                        </p>
                        <p className="text-sm font-bold text-white truncate mt-0.5">
                          {subject || "No subject set"}
                        </p>
                      </div>
                      <Monitor className="h-4 w-4 text-slate-500" />
                    </div>

                    <div className="flex-1 bg-slate-950/30 border border-slate-800 rounded-3xl p-6 flex justify-center items-center overflow-hidden min-h-[400px]">
                      <iframe
                        srcDoc={getCompiledPreview()}
                        title="Sandbox Email Live Preview"
                        className="w-full h-full border-none rounded-2xl bg-white shadow-xl max-w-[620px]"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          ) : (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8 bg-slate-900/10 border border-dashed border-slate-800 rounded-3xl backdrop-blur-xl">
              <Mail className="h-16 w-16 text-slate-700 mb-4 animate-bounce" />
              <h3 className="text-lg font-black text-slate-400">
                No Template Selected
              </h3>
              <p className="text-sm text-slate-500 font-bold mt-1">
                Select a dynamic email template from the left pane to edit.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
