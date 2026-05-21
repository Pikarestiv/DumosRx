import { Mail, ArrowRight, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TemplateListProps {
  templates: any[];
  selectedTemplate: any;
  loadTemplateDetails: (id: number) => void;
}

export function TemplateList({ templates, selectedTemplate, loadTemplateDetails }: TemplateListProps) {
  return (
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
  );
}
