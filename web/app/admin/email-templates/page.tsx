"use client";

import { useEffect, useState, useRef } from "react";
import { webApiClient } from "@/lib/api/client";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TemplateList } from "@/components/admin/email-templates/template-list";
import { TemplateEditor } from "@/components/admin/email-templates/template-editor";

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
        <TemplateList 
          templates={templates}
          selectedTemplate={selectedTemplate}
          loadTemplateDetails={loadTemplateDetails}
        />

        {/* Right pane: Editor & Sandbox */}
        <div className="lg:col-span-2">
          <TemplateEditor
            selectedTemplate={selectedTemplate}
            subject={subject}
            setSubject={setSubject}
            content={content}
            setContent={setContent}
            saving={saving}
            handleSave={handleSave}
            setActiveTab={setActiveTab}
            textareaRef={textareaRef}
            insertVariable={insertVariable}
            getCompiledPreview={getCompiledPreview}
          />
        </div>
      </div>
    </div>
  );
}
