import { useEffect, useRef, useState } from "react";
import { sendCopilotMessage } from "../../services/aiApi";
import {
    Bot,
    Send,
    User,
    LoaderCircle,
    Sparkles,
    AlertCircle,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

function EarthCopilot({ regionId, regionName }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const abortControllerRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        setMessages([]);
        setInput("");
        setError("");

        abortControllerRef.current?.abort();
        setLoading(false);

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [regionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages, loading]);

    async function handleSubmit(event) {
        event.preventDefault();

        const message = input.trim();

        if (!message || loading) return;

        if (!regionId) {
            setError("Select a region before asking a question.");
            return;
        }

        const previousMessages = messages;

        setMessages((current) => [
            ...current,
            { role: "user", content: message },
        ]);

        setInput("");
        setError("");
        setLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const result = await sendCopilotMessage({
                regionId,
                message,
                history: previousMessages
                    .slice(-8)
                    .map(({ role, content }) => ({ role, content })),
                signal: controller.signal,
            });

            setMessages((current) => [
                ...current,
                {
                    role: "assistant",
                    content: result.answer,
                },
            ]);
        } catch (err) {
            if (err.name !== "AbortError") {
                setError(err.message || "Unable to get an AI response.");
            }
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setLoading(false);
            }
        }
    }


    return (
        <>
            {!isOpen && (
                <button
                    type="button"
                    className="copilot-launcher"
                    onClick={() => setIsOpen(true)}
                    aria-label="Open Earth Intelligence Copilot"
                    title="Ask Earth Copilot"
                >
                    <Sparkles size={23} />
                    <span>AI Copilot</span>
                </button>
            )}

            {isOpen && (
                <section className="earth-copilot">
                    <div className="copilot-header">
                        <div className="copilot-heading">
                            <div className="copilot-icon">
                                <Sparkles size={18} />
                            </div>

                            <div>
                                <h2>Earth Intelligence Copilot</h2>
                                <p>
                                    {regionName
                                        ? `Exploring ${regionName}`
                                        : "Select a region to begin"}
                                </p>
                            </div>
                        </div>

                        <div className="copilot-header-actions">
                            <span className="copilot-status">
                                <span className="copilot-status-dot" />
                                AI ANALYSIS
                            </span>

                            <button
                                type="button"
                                className="copilot-close"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close Copilot"
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="copilot-messages">
                        {messages.length === 0 && (
                            <div className="copilot-welcome">
                                <div className="copilot-welcome-icon">
                                    <Bot size={26} />
                                </div>

                                <h3>Ask Earth. Understand change.</h3>

                                <p>
                                    Ask questions about historical temperature patterns,
                                    anomalies, trends, and what the available data tells us.
                                </p>

                                <div className="copilot-suggestions">
                                    {[
                                        "What does the temperature data show?",
                                        "Which year had the highest temperature anomaly?",
                                        "Explain the long-term temperature trend.",
                                    ].map((question) => (
                                        <button
                                            key={question}
                                            type="button"
                                            disabled={!regionId || loading}
                                            onClick={() => setInput(question)}
                                        >
                                            {question}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((message, index) => (
                            <div
                                key={`${index}-${message.role}`}
                                className={`copilot-message ${message.role === "user"
                                        ? "copilot-user-message"
                                        : "copilot-ai-message"
                                    }`}
                            >
                                <div className="copilot-avatar">
                                    {message.role === "user" ? (
                                        <User size={15} />
                                    ) : (
                                        <Bot size={15} />
                                    )}
                                </div>

                                <div className="copilot-message-content">
                                    <span>
                                        {message.role === "user" ? "YOU" : "EARTH COPILOT"}
                                    </span>

                                    {message.role === "assistant" ? (
                                        <div className="copilot-markdown">
                                            <ReactMarkdown>{message.content}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p>{message.content}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="copilot-loading">
                                <LoaderCircle size={16} className="copilot-spinner" />
                                Analysing regional data...
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {error && (
                        <div className="copilot-error" role="alert">
                            <AlertCircle size={15} />
                            {error}
                        </div>
                    )}

                    <form className="copilot-input-area" onSubmit={handleSubmit}>
                        <input
                            type="text"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            placeholder={
                                regionId
                                    ? `Ask about ${regionName || "this region"}...`
                                    : "Select a region first..."
                            }
                            maxLength={2000}
                            disabled={!regionId || loading}
                        />

                        <button
                            type="submit"
                            disabled={!regionId || loading || !input.trim()}
                            aria-label="Send message"
                        >
                            {loading ? (
                                <LoaderCircle size={18} className="copilot-spinner" />
                            ) : (
                                <Send size={18} />
                            )}
                        </button>
                    </form>

                    <p className="copilot-disclaimer">
                        AI explanations are grounded in available EarthExplorer data.
                    </p>
                </section>
            )}
        </>
    );

}

export default EarthCopilot;