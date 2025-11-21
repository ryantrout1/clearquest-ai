import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verify authentication
    const user = await base44.auth.me();
    if (!user || user.role !== 'SUPER_ADMIN') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Send prompt to default agent using backend context
    const agentResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: prompt,
      add_context_from_internet: false
    });

    // Return plain text result
    return Response.json({
      success: true,
      result: agentResponse
    });

  } catch (error) {
    console.error('Error in probe_test_backend:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});