import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, Trash2, MessageSquare, FolderOpen, TrendingUp, Rocket, Zap, Flame, Brain, Diamond, Clock, Atom, Crown, Gauge, Star, CircuitBoard, Cpu } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

type AIModel = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  model: string;
  provider: "openai" | "google" | "supernova";
  tier: "premium" | "standard" | "fast";
};

type Conversation = {
  id: string;
  title: string;
  model: string;
  modelName: string;
  timestamp: Date;
  messages: Message[];
};

const AI_MODELS: AIModel[] = [
  // OpenAI
  { id: "gpt5.2", name: "GPT-5.2", description: "Lo último de OpenAI. Razonamiento avanzado y resolución de problemas complejos", icon: <Crown className="w-6 h-6 text-warning" />, model: "openai/gpt-5.2", provider: "openai", tier: "premium" },
  { id: "gpt5", name: "GPT-5", description: "Razonamiento potente, contexto largo y multimodal", icon: <Brain className="w-6 h-6 text-warning" />, model: "openai/gpt-5", provider: "openai", tier: "premium" },
  { id: "gpt5mini", name: "GPT-5 Mini", description: "Balance entre rendimiento y velocidad. Ideal para la mayoría de tareas", icon: <Zap className="w-6 h-6 text-warning" />, model: "openai/gpt-5-mini", provider: "openai", tier: "standard" },
  { id: "gpt5nano", name: "GPT-5 Nano", description: "Ultra rápido y económico. Perfecto para tareas simples de alto volumen", icon: <Gauge className="w-6 h-6 text-warning" />, model: "openai/gpt-5-nano", provider: "openai", tier: "fast" },
  // Google Gemini
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", description: "Última generación de Google. Razonamiento de vanguardia", icon: <Star className="w-6 h-6 text-accent" />, model: "google/gemini-3.1-pro-preview", provider: "google", tier: "premium" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Top en razonamiento complejo, imagen+texto y contextos enormes", icon: <Diamond className="w-6 h-6 text-accent" />, model: "google/gemini-2.5-pro", provider: "google", tier: "premium" },
  { id: "gemini-flash", name: "Gemini Flash", description: "Rápido y eficiente. Equilibrio ideal entre velocidad y capacidad", icon: <Rocket className="w-6 h-6 text-accent" />, model: "google/gemini-3-flash-preview", provider: "google", tier: "standard" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Bueno en multimodal y razonamiento con menos costo que Pro", icon: <CircuitBoard className="w-6 h-6 text-accent" />, model: "google/gemini-2.5-flash", provider: "google", tier: "standard" },
  { id: "gemini-lite", name: "Gemini Lite", description: "El más rápido y económico. Ideal para clasificación y resúmenes", icon: <Cpu className="w-6 h-6 text-accent" />, model: "google/gemini-2.5-flash-lite", provider: "google", tier: "fast" },
  // Supernova Custom
  { id: "nexus", name: "Nexus Power", description: "IA SUPERNOVA especializada en marketing digital, ads y ventas", icon: <Flame className="w-6 h-6 text-destructive" />, model: "google/gemini-3-flash-preview", provider: "supernova", tier: "standard" },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

export function ChatPage() {
  const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[6]); // Gemini Flash default
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stats = [
    { icon: <Sparkles className="w-5 h-5 text-primary" />, value: conversations.length.toString(), label: "Experimentos", change: `+${Math.min(conversations.length, 12)} esta semana` },
    { icon: <MessageSquare className="w-5 h-5 text-primary" />, value: conversations.reduce((acc, c) => acc + c.messages.length, 0).toString(), label: "Mensajes", change: "+186 esta semana" },
    { icon: <FolderOpen className="w-5 h-5 text-primary" />, value: "8", label: "Proyectos", change: "+2 este mes" },
    { icon: <TrendingUp className="w-5 h-5 text-primary" />, value: "94%", label: "Productividad", change: "+5% vs mes pasado" },
  ];

  const startNewConversation = () => {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "Nuevo experimento",
      model: selectedModel.model,
      modelName: selectedModel.name,
      timestamp: new Date(),
      messages: [],
    };
    setActiveConversation(conv);
    setMessages([]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Auto-create conversation if none active
    if (!activeConversation) {
      const conv: Conversation = {
        id: crypto.randomUUID(),
        title: input.trim().slice(0, 40),
        model: selectedModel.model,
        modelName: selectedModel.name,
        timestamp: new Date(),
        messages: newMessages,
      };
      setActiveConversation(conv);
      setConversations((prev) => [conv, ...prev]);
    } else {
      // Update title on first message
      if (messages.length === 0) {
        const updated = { ...activeConversation, title: input.trim().slice(0, 40), messages: newMessages };
        setActiveConversation(updated);
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
    }

    let assistantSoFar = "";

    const systemPrompt = selectedModel.id === "nexus"
      ? `Eres Nexus Power, un asistente IA ultra-especializado en marketing digital, publicidad pagada y ventas. 
Dominas Meta Ads, Google Ads, TikTok Ads, funnels de conversión, copywriting persuasivo, y métricas clave (ROAS, CTR, CPA, CPM).
Responde siempre en español. Sé directo, práctico y orientado a resultados. Usa emojis moderadamente.`
      : undefined;

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          ...(systemPrompt && { systemPrompt }),
          model: selectedModel.model,
        }),
      });

      if (resp.status === 429) { toast.error("Demasiadas solicitudes, intenta en unos segundos"); setIsLoading(false); return; }
      if (resp.status === 402) { toast.error("Créditos agotados. Agrega fondos en Configuración."); setIsLoading(false); return; }
      if (!resp.ok || !resp.body) throw new Error("Error al conectar con IA");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Save final messages to conversation
      setMessages((prev) => {
        const finalMsgs = [...prev];
        if (activeConversation) {
          setConversations((convs) =>
            convs.map((c) => (c.id === activeConversation.id ? { ...c, messages: finalMsgs } : c))
          );
        }
        return finalMsgs;
      });
    } catch (err: any) {
      toast.error(err.message || "Error al procesar mensaje");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); }
  };

  const loadConversation = (conv: Conversation) => {
    setActiveConversation(conv);
    setMessages(conv.messages);
    const model = AI_MODELS.find((m) => m.model === conv.model);
    if (model) setSelectedModel(model);
  };

  const timeAgo = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diff < 1) return "ahora";
    if (diff < 60) return `hace ${diff}m`;
    if (diff < 1440) return `hace ${Math.floor(diff / 60)}h`;
    return `hace ${Math.floor(diff / 1440)} días`;
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div>
        <h2 className="font-display font-bold text-xl text-foreground">Panel de Control</h2>
        <p className="text-sm text-muted-foreground">Bienvenido de vuelta 👋</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card-surface rounded-xl p-4">
            <div className="mb-2">{s.icon}</div>
            <div className="font-display font-bold text-2xl text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-xs text-primary mt-1">{s.change}</div>
          </div>
        ))}
      </div>

      {/* AI Models */}
      <div>
        <h3 className="font-display font-semibold text-foreground mb-3">Inteligencias Artificiales</h3>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {AI_MODELS.map((model) => {
            const isSelected = selectedModel.id === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model)}
                className={`relative text-left rounded-xl p-4 border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-secondary hover:border-muted-foreground/30"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                )}
                <div className="mb-3">{model.icon}</div>
                <div className="font-display font-semibold text-sm text-foreground">{model.name}</div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-tight line-clamp-2">{model.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main area: Conversations + Chat */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Conversations list */}
        <div className="w-1/2 flex flex-col min-h-0">
          <h3 className="font-display font-semibold text-foreground mb-3">Experimentos Recientes</h3>
          <div className="flex-1 overflow-auto space-y-2">
            {conversations.length === 0 ? (
              <div className="card-surface rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">No hay experimentos aún. ¡Comienza uno nuevo!</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  className={`w-full text-left card-surface rounded-xl p-4 flex items-center gap-3 transition-all hover:border-primary/30 border ${
                    activeConversation?.id === conv.id ? "border-primary/50" : "border-transparent"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Rocket className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{conv.title}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      {conv.modelName}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(conv.timestamp)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="w-1/2 flex flex-col card-surface rounded-xl border border-border min-h-0">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              <span className="font-display font-semibold text-sm text-foreground">Chat con {selectedModel.name}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">Experimento activo</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-foreground mb-1">Comienza tu experimento</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Escribe tu primera pregunta para empezar a chatear con la IA.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="bg-secondary rounded-xl px-4 py-3">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje..."
              rows={1}
              className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all resize-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-3 gradient-brand text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
