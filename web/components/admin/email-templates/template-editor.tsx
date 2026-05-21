import { Save, Loader2, Code, Eye, Sparkles, Info, Check, Monitor, Mail } from "lucide-react";
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

interface TemplateEditorProps {
  selectedTemplate: any;
  subject: string;
  setSubject: (val: string) => void;
  content: string;
  setContent: (val: string) => void;
  saving: boolean;
  handleSave: () => void;
  setActiveTab: (val: string) => void;
  textareaRef: any;
  insertVariable: (val: string) => void;
  getCompiledPreview: () => string;
}

export function TemplateEditor({
  selectedTemplate,
  subject,
  setSubject,
  content,
  setContent,
  saving,
  handleSave,
  setActiveTab,
  textareaRef,
  insertVariable,
  getCompiledPreview,
}: TemplateEditorProps) {
  if (!selectedTemplate) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8 bg-slate-900/10 border border-dashed border-slate-800 rounded-3xl backdrop-blur-xl">
        <Mail className="h-16 w-16 text-slate-700 mb-4 animate-bounce" />
        <h3 className="text-lg font-black text-slate-400">
          No Template Selected
        </h3>
        <p className="text-sm text-slate-500 font-bold mt-1">
          Select a dynamic email template from the left pane to edit.
        </p>
      </div>
    );
  }

  return (
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
                  {selectedTemplate.variables.map((v: any, i: number) => (
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
  );
}
