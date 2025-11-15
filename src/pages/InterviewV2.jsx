// NEW: Build agent chat history (similar to deterministic Q&A flow)
  const buildAgentChatHistory = useCallback(() => {
    const agentChatItems = [];
    
    // Filter out system messages and base questions - but keep everything else in order
    const cleanMessages = agentMessages.filter(msg => {
      if (!msg.content || msg.content.trim() === '') return false;
      if (msg.content?.includes('Follow-up pack completed')) return false;
      if (msg.content?.match(/\b(Q\d{1,3})\b/i)) return false;
      return true;
    });
    
    // Simply render all messages in order - no pairing, no complex logic
    cleanMessages.forEach((msg, i) => {
      if (msg.role === 'assistant') {
        agentChatItems.push({
          type: 'agent_question',
          data: msg,
          key: `aq-${msg.id || i}`
        });
      } else if (msg.role === 'user') {
        agentChatItems.push({
          type: 'agent_answer',
          data: msg,
          key: `aa-${msg.id || i}`
        });
      }
    });
    
    return agentChatItems;
  }, [agentMessages]);