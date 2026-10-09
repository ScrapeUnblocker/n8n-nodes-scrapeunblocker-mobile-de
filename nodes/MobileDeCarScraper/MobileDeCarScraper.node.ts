import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OptionField, OutputShape } from './GenericFunctions';
import { applyOptions, requireString, runActorAndGetItems, shapeItems } from './GenericFunctions';

// ScrapeUnblocker's public "Mobile.de Car Scraper" Actor: https://apify.com/scrapeunblocker/mobile-de-scraper
const ACTOR_ID = 'mZb40xzXjCbLDjlwY';
const INTEGRATION_APP_ID = 'scrapeunblocker-mobile-de-scraper';

// Node option name -> Actor input key.
const OPTION_FIELDS: Record<string, OptionField> = {
	makeId: {
		key: 'make_id',
		kind: 'nonZero',
	},
	fuel: {
		key: 'fuel',
	},
	priceMin: {
		key: 'price_min',
	},
	priceMax: {
		key: 'price_max',
	},
	yearMin: {
		key: 'year_min',
	},
	mileageMax: {
		key: 'mileage_max',
	},
	proxyCountry: {
		key: 'proxy_country',
		kind: 'upper',
	},
};

// "resource:operation" -> fields kept by Simplify (dot paths are flattened: a.b -> aB).
const OUTPUT_SHAPES: Record<string, OutputShape> = {};

function buildActorInput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	options: IDataObject,
	itemIndex: number,
): IDataObject {
	const input: IDataObject = {};

	switch (`${resource}:${operation}`) {
		case 'listing:search': {
			input.make = requireString.call(this, 'make', 'Make', itemIndex);
			input.max_results = this.getNodeParameter('maxResults', itemIndex);
			break;
		}
		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation '${operation}' is not supported for resource '${resource}'`,
				{ itemIndex },
			);
	}

	applyOptions(input, options, OPTION_FIELDS);
	return input;
}

export class MobileDeCarScraper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mobile.de Car Scraper',
		name: 'mobileDeCarScraper',
		icon: {
			light: 'file:mobileDeCarScraper.png',
			dark: 'file:mobileDeCarScraper.dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Search mobile.de car listings in Germany with the ScrapeUnblocker Actor on Apify',
		defaults: {
			name: 'Mobile.de Car Scraper',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'apifyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Listing',
						value: 'listing',
					},
				],
				default: 'listing',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['listing'],
					},
				},
				options: [
					{
						name: 'Search',
						value: 'search',
						description: 'Search car listings of one make with filters',
						action: 'Search listings',
					},
				],
				default: 'search',
			},
			{
				displayName: 'Make',
				name: 'make',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. BMW',
				description: "Car make, e.g. 'BMW', 'Volkswagen' or 'Audi'",
				displayOptions: {
					show: {
						resource: ['listing'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 500,
				},
				default: 20,
				description: 'How many listings to collect across pages (about 20 per page, up to 500)',
				displayOptions: {
					show: {
						resource: ['listing'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Browse From Country',
						name: 'proxyCountry',
						type: 'string',
						default: '',
						placeholder: 'e.g. DE',
						description:
							'Two-letter code of the country the site is opened from (e.g. DE). Leave empty to choose one automatically.',
					},
					{
						displayName: 'First Registration From (Year)',
						name: 'yearMin',
						type: 'number',
						typeOptions: {
							minValue: 1900,
							maxValue: 2100,
						},
						default: 2018,
						description: 'Earliest year of first registration, e.g. 2018',
					},
					{
						displayName: 'Fuel',
						name: 'fuel',
						type: 'options',
						options: [
							{
								name: 'Any',
								value: '',
							},
							{
								name: 'Diesel',
								value: 'diesel',
							},
							{
								name: 'Electric',
								value: 'electric',
							},
							{
								name: 'Hybrid',
								value: 'hybrid',
							},
							{
								name: 'Petrol',
								value: 'petrol',
							},
						],
						default: '',
						description: 'Only cars with this fuel type',
					},
					{
						displayName: 'Make ID',
						name: 'makeId',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							'Numeric mobile.de make ID that overrides Make, e.g. 3500 for BMW. Use it for makes the name lookup does not find.',
					},
					{
						displayName: 'Max Mileage (Km)',
						name: 'mileageMax',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 100000,
						description: 'Highest mileage to include, in km',
					},
					{
						displayName: 'Max Price (EUR)',
						name: 'priceMax',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 20000,
						description: 'Highest price to include, in EUR',
					},
					{
						displayName: 'Min Price (EUR)',
						name: 'priceMin',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description: 'Lowest price to include, in EUR',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							"How long the Apify run may take, in seconds. 0 uses the Actor's default. If the time runs out, the node stops.",
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const { timeout, ...actorOptions } = options;

				const input = buildActorInput.call(this, resource, operation, actorOptions, i);
				const { items: results } = await runActorAndGetItems.call(this, {
					actorId: ACTOR_ID,
					integrationAppId: INTEGRATION_APP_ID,
					input,
					itemIndex: i,
					timeoutSecs: (timeout as number) || undefined,
				});
				const shape = OUTPUT_SHAPES[`${resource}:${operation}`];

				for (const result of shapeItems.call(this, results, shape, i)) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
