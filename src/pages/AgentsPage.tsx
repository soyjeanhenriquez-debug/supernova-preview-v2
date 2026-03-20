import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus, Bot, Pencil, Trash2, Loader2, Send, Star, ArrowLeft, X,
  Zap, Target, Megaphone, PenTool, MessageSquare
} from "lucide-react";

const iconOptions = [
  { value: "bot", icon: Bot, label: "Bot" },
  { value: "zap", icon: Zap, label: "Rayo" },
  { value: "target", icon: Target, label: "Target" },
  { value: "megaphone", icon: Megaphone, label: "Megáfono" },
  { value: "pen", icon: PenTool, label: "Escritor" },
  { value: "chat", icon: MessageSquare, label: "Chat" },
];

const getIcon = (name: string) => iconOptions.find((o) => o.value === name)?.icon || Bot;

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

export function AgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAgent, setEditAgent] = useState<any>(null);
  const [chatAgent, setChatAgent] = useState<any>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [icon, setIcon] = useState("bot");

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchAgents = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setAgents(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, [user]);

  const resetForm = () => {
    setName(""); setDescription(""); setSystemPrompt(""); setIcon("bot");
    setEditAgent(null); setShowForm(false);
  };

  const openEdit = (a: any) => {
    setName(a.name); setDescription(a.description || ""); setSystemPrompt(a.system_prompt); setIcon(a.icon || "bot");
    setEditAgent(a); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !systemPrompt.trim()) return;

    if (editAgent) {
      const { error } = await supabase.from("agents").update({ name, description, system_prompt: systemPrompt, icon }).eq("id", editAgent.id);
      if (error) toast.error("Error al actualizar"); else toast.success("Agente actualizado");
    } else {
      const { error } = await supabase.from("agents").insert({ user_id: user.id, name, description, system_prompt: systemPrompt, icon });
      if (error) toast.error("Error al crear"); else toast.success("Agente creado");
    }
    resetForm(); fetchAgents();
  };

  const deleteAgent = async (id: string) => {
    if (!confirm("¿Eliminar este agente?")) return;
    await supabase.from("agents").delete().eq("id", id);
    toast.success("Agente eliminado"); fetchAgents();
  };

  const toggleFav = async (a: any) => {
    await supabase.from("agents").update({ is_favorite: !a.is_favorite }).eq("id", a.id);
    fetchAgents();
  };

  const openChat = (a: any) => {
    setChatAgent(a); setMessages([]); setInput("");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !chatAgent) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((p) => [...p, userMsg]);
    setInput(""); setIsStreaming(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          systemPrompt: chatAgent.system_prompt,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Error de conexión");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((p) => {
          const last = p[p.length - 1];
          if (last?.role === "assistant") return p.map((m, i) => i === p.length - 1 ? { ...m, content: assistantSoFar } : m);
          return [...p, { role: "assistant", content: assistantSoFar }];
        });
      };

      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let ni: number;
        while ((ni = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, ni); buf = buf.slice(ni + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const js = line.slice(6).trim();
          if (js === "[DONE]") { done = true; break; }
          try { const p = JSON.parse(js); const c = p.choices?.[0]?.delta?.content; if (c) upsert(c); }
          catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setIsStreaming(false); }
  };

  // Chat view
  if (chatAgent) {
    const IconComp = getIcon(chatAgent.icon);
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setChatAgent(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center">
            <IconComp className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground text-sm">{chatAgent.name}</h3>
            <p className="text-xs text-muted-foreground">{chatAgent.description}</p>
          </div>
        </div>

        <div className="flex-1 overflow-auto card-surface rounded-xl p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mb-3">
                <IconComp className="w-7 h-7 text-primary-foreground" />
              </div>
              <h3 className="font-display font-semibold text-foreground mb-1">{chatAgent.name}</h3>
              <p className="text-sm text-muted-foreground max-w-sm">{chatAgent.description || "Empieza a chatear con este agente"}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0 mt-0.5">
                  <IconComp className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
                <IconComp className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="bg-secondary rounded-xl px-4 py-3"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="mt-3 flex gap-2">
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
            placeholder="Escribe tu mensaje..." rows={1}
            className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
          />
          <button type="submit" disabled={isStreaming || !input.trim()} className="px-4 py-3 gradient-brand text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> Agentes IA
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Crea chatbots personalizados con instrucciones específicas</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Nuevo Agente
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => resetForm()}>
          <div className="card-surface rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-foreground">{editAgent ? "Editar" : "Crear"} Agente</h3>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Copywriter Pro"
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descripción</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descripción de qué hace"
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Icono</label>
                <div className="flex gap-2 mt-1">
                  {iconOptions.map((opt) => {
                    const I = opt.icon;
                    return (
                      <button key={opt.value} type="button" onClick={() => setIcon(opt.value)}
                        className={`p-2.5 rounded-lg transition-all ${icon === opt.value ? "gradient-brand text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                        <I className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Prompt</label>
                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} required rows={5}
                  placeholder="Eres un experto en copywriting que genera textos de alta conversión..."
                  className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                <button type="submit" className="px-5 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90">
                  {editAgent ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agents grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : agents.length === 0 ? (
        <div className="card-surface rounded-xl py-20 text-center">
          <div className="text-5xl mb-4">🤖</div>
          <div className="font-display font-semibold text-foreground mb-2">Sin agentes todavía</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto mb-4">Crea tu primer agente con instrucciones personalizadas para automatizar tareas de marketing</div>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90">
            <Plus className="w-4 h-4 inline mr-1" /> Crear Agente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((a) => {
            const IconComp = getIcon(a.icon);
            return (
              <div key={a.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group cursor-pointer" onClick={() => openChat(a)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center">
                    <IconComp className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleFav(a)} className={`p-1.5 rounded transition-colors ${a.is_favorite ? "text-warning" : "text-muted-foreground hover:text-warning"}`}>
                      <Star className={`w-3.5 h-3.5 ${a.is_favorite ? "fill-warning" : ""}`} />
                    </button>
                    <button onClick={() => openEdit(a)} className="p-1.5 rounded text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteAgent(a.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <h3 className="font-display font-semibold text-foreground text-sm mb-1">{a.name}</h3>
                {a.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{a.description}</p>}
                <div className="text-xs text-muted-foreground/60 line-clamp-1 italic">"{a.system_prompt.slice(0, 80)}..."</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
