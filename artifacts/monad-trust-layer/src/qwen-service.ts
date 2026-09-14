import OpenAI from 'openai';

// Alibaba Cloud Qwen API configuration (official endpoint)
const QWEN_API_KEY = import.meta.env.VITE_QWEN_API_KEY || import.meta.env.QWEN_API_KEY || '';
const QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = 'qwen-max';

// Check if API key is available
const isQwenConfigured = QWEN_API_KEY && 
                        QWEN_API_KEY !== 'your_qwen_api_key_here' &&
                        QWEN_API_KEY.length > 0;

// Initialize Qwen client with Alibaba Cloud configuration (only if configured)
let qwenClient: OpenAI | null = null;
if (isQwenConfigured) {
  qwenClient = new OpenAI({
    apiKey: QWEN_API_KEY,
    baseURL: QWEN_BASE_URL,
    dangerouslyAllowBrowser: true, // Required for browser environment
  });
}

// Tool definitions for function calling
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'check_delegation_limit',
      description: 'Check the current delegation limit and available spending authority',
      parameters: {
        type: 'object',
        properties: {
          tier: {
            type: 'string',
            enum: ['micro', 'routine', 'elevated'],
            description: 'The delegation tier to check'
          }
        },
        required: [] as string[]
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_transaction',
      description: 'Execute a transaction within delegation limits',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'The amount to spend in MON'
          },
          actionType: {
            type: 'string',
            enum: ['small', 'large'],
            description: 'Type of action: small (immediate) or large (requires authorization)'
          },
          reason: {
            type: 'string',
            description: 'Reason for this transaction'
          }
        },
        required: ['amount', 'actionType', 'reason'] as string[]
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_authorization',
      description: 'Request authorization for a high-stakes action that exceeds immediate delegation limits',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'The amount requiring authorization'
          },
          reason: {
            type: 'string',
            description: 'Detailed reason for this authorization request'
          },
          tier: {
            type: 'string',
            enum: ['routine', 'elevated'],
            description: 'The target delegation tier for this action'
          }
        },
        required: ['amount', 'reason', 'tier'] as string[]
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_portfolio',
      description: 'Analyze current portfolio state and available opportunities',
      parameters: {
        type: 'object',
        properties: {},
        required: [] as string[]
      }
    }
  }
];

// Qwen agent class
export class QwenAgent {
  private client: OpenAI | null;
  private currentDelegationTier: string = 'routine';
  private delegationLimits: Record<string, number> = {
    micro: 5,
    routine: 50,
    elevated: 500
  };

  constructor() {
    this.client = qwenClient;
  }

  isAvailable(): boolean {
    return isQwenConfigured && this.client !== null;
  }

  setDelegationTier(tier: string) {
    this.currentDelegationTier = tier;
  }

  getDelegationLimit(): number {
    return this.delegationLimits[this.currentDelegationTier] || 50;
  }

  async makeDecision(userPrompt: string): Promise<{
    reasoning: string;
    action: string;
    parameters?: any;
    requiresAuth: boolean;
  }> {
    // Check if Qwen is configured
    if (!isQwenConfigured || !this.client) {
      return {
        reasoning: 'Qwen AI Agent is not configured. Please add your QWEN_API_KEY to the environment variables.',
        action: 'error',
        requiresAuth: false
      };
    }

    try {
      if (!this.client) {
        throw new Error('Qwen client not configured');
      }

      const systemPrompt = `You are an AI financial agent managing a Monad portfolio with proportional authorization. 
      Current delegation tier: ${this.currentDelegationTier} (limit: ${this.getDelegationLimit()} MON)
      
      Rules:
      - Small actions (<$50 routine tier): Execute immediately without authorization
      - Large actions (>$50 routine tier): Request authorization before execution
      - Always stay within delegation limits
      - Explain your reasoning clearly
      - Use the available tools to interact with the system
      
      Available delegation tiers:
      - micro: $5 limit (immediate execution only)
      - routine: $50 limit (immediate up to $50, auth above)
      - elevated: $500 limit (immediate up to $50, auth above)
      
      Focus on practical, safe financial decisions within the given constraints.`;

      const response = await this.client.chat.completions.create({
        model: QWEN_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: tools,
        tool_choice: 'auto',
        max_tokens: 1000
      });

      const message = response.choices[0].message;
      
      // Check if Qwen wants to use a tool
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        
        // Type guard for function calls
        if (toolCall.type === 'function') {
          const functionCall = toolCall as any; // Type assertion for function call
          const toolName = functionCall.function.name;
          const toolArgs = JSON.parse(functionCall.function.arguments || '{}');

          return {
            reasoning: message.content || 'Executing delegated action',
            action: toolName,
            parameters: toolArgs,
            requiresAuth: toolName === 'request_authorization' || 
                         (toolName === 'execute_transaction' && toolArgs.amount > 50)
          };
        }
      }

      // If no tool call, return the reasoning as a plan
      return {
        reasoning: message.content || 'No action required',
        action: 'plan',
        requiresAuth: false
      };

    } catch (error) {
      console.error('Qwen API error:', error);
      throw new Error(`Qwen decision failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeSmallTransaction(amount: number, reason: string): Promise<string> {
    // This would call your existing transaction system
    // For now, simulate the response
    return `Executing small transaction: ${amount} MON for ${reason}`;
  }

  async requestLargeAuth(amount: number, reason: string): Promise<string> {
    // This would trigger your existing authorization flow
    return `Requesting authorization for ${amount} MON: ${reason}`;
  }
}

// Export singleton instance
export const qwenAgent = new QwenAgent();