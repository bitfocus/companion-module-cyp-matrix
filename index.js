// CYP V8H8HPA HDMI Matrix Switch

let tcp = require('../../tcp');
let instance_skel = require('../../instance_skel');
// const { map, update } = require('lodash');

var debug;
var log;

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.CHOICES_INPUTS = [
			{ id: "1", label: "1" },
			{ id: "2", label: "2" },
			{ id: "3", label: "3" },
			{ id: "4", label: "4" },
			{ id: "5", label: "5" },
			{ id: "6", label: "6" },
			{ id: "7", label: "7" },
			{ id: "8", label: "8" },
		]
		this.CHOICES_OUTPUTS = [
			{ id: "A", label: "A" },
			{ id: "B", label: "B" },
			{ id: "C", label: "C" },
			{ id: "D", label: "D" },
			{ id: "E", label: "E" },
			{ id: "F", label: "F" },
			{ id: "G", label: "G" },
			{ id: "H", label: "H" },
		]
		this.CHOICES_POWER = [
			{ id: "ON", label: "ON" },
			{ id: "STANDBY", label: "STANDBY" },
		]
		this.CHOICES_ONOFFTOGGLE = [
			{ id: "on", label: "ON" },
			{ id: "off", label: "OFF" },
			{ id: "toggle", label: "TOGGLE" },
		]
		this.pollMixerTimer = undefined
		this.selectedInput = 1
		this.outputRoute = {A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8}
		this.outputMask = {A:'off', B:'off', C:'off', D:'off', E:'off', F:'off', G:'off', H:'off'}
	}

	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		debug('destroy', this.id)
	}

	init() {
		debug = this.debug
		log = this.log
		this.updateConfig(this.config)
	}

	updateConfig(config) {
		// polling is running and polling may have been de-selected by config change
		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
		this.config = config

		this.config.polling_interval = this.config.polling_interval !== undefined ? this.config.polling_interval : 750;
		this.config.port = this.config.port !== undefined ? this.config.port : 23;
		
		this.initActions()
		this.initFeedbacks()
		this.initVariables();
		this.init_tcp()
		this.initPolling()
		this.initPresets();
	}

	init_tcp() {

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, this.config.port)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				debug('Network error', err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				this.initChannelNames()
				debug('Connected')
			})

			this.socket.on('data', (receivebuffer) => {
				this.processResponse(receivebuffer)		
			})
		}
	}

	processResponse(receivebuffer) {
		if (this.config.log_responses) {this.log('info', 'Response: ' + receivebuffer)}
		if (receivebuffer.includes("status :")) {
			// let responses = receivebuffer.toString('utf8').replace(/(\r\n|\n|\r)/gm,"").split('status : ')
			// token indexes correct? check and test
			let responses = receivebuffer.toString('utf8').split(/[\r\n]+/)
			for (let response of responses) {
			if (response.length > 0) {
				let tokens = response.split(' ')
				if (this.config.log_tokens) {this.log('info', 'Tokens: ' + tokens)}
				/*
				status : out a route 1
				status : out a mask on
				status : out a mask off
				status : in 1 name INPUT 1  
				status : out a name OUTPUT A 
				*/
				if (tokens[0] == 'status') {// May get command echos
					switch (tokens[4]) {
						case 'name':
							this.updateName(tokens[2], tokens[3], tokens[5] + ' ' + tokens[6])
							break
						case 'route':
							if (this.config.polled_data) {
								this.updateRoute(tokens[3].toUpperCase(), tokens[5])
							}
							break
						case 'mask':
							if (this.config.polled_data) {
								this.updateMask(tokens[3], tokens[5])
							}
							break
						}
					}
					this.checkFeedbacks()
				}
			}
		}
	}

	sendCommmand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.connected) {
				this.socket.send(cmd + '\r\n')
			} else {
				debug('Socket not connected :(')
			}
		}
	}

	initPolling() {
		// poll to pick up switch state from possible changes from controls on the unit
		if (this.pollMixerTimer === undefined) {
			this.pollMixerTimer = setInterval(() => {
				this.CHOICES_OUTPUTS.forEach((item) => {
					this.sendCommmand('GET OUT ' + item.id + ' ROUTE');
					this.sendCommmand('GET OUT ' + item.id + ' MASK');
				  })
			}, this.config.poll_interval)
		}
	}

	updateMatrixVariables() {
		this.CHOICES_INPUTS.forEach((input) =>
		{
			let list = ''
			for (let key in this.outputRoute) {
				if (this.outputRoute[key] == input.id){
					list += key
				}
			}
			this.setVariable(`input_route${input.id}`, list)
		})
	}

	updateRoute(output, input) {
		this.outputRoute[output] = input
		this.setVariable(`output_route${output}`, input)
		this.updateMatrixVariables()
	}

	updateMask(output, onofftoggle) {
		if (onofftoggle == "toggle") {
			this.outputMask[output] == 'off' ? onofftoggle = 'on' : onofftoggle = 'off'
		}
		this.outputMask[output.toUpperCase()] = onofftoggle.toLowerCase()
		return onofftoggle.toUpperCase()
	}

	updateName(nameType, index, name)  {
		switch (nameType) {
			case 'in':
				this.setVariable('input_name' + index, name)
				break
			case 'out':
				this.setVariable('output_name' + index.toUpperCase(), name)
				break
		}	
	}

	initChannelNames() {
	this.sendCommmand('GET IN NAME LIST');
	this.sendCommmand('GET OUT NAME LIST');
	}

	initVariables() {
		let variables = []
		for (let i = 1; i <= 8; i++) {
			variables.push({
				label: `Input ${i}`,
				name: `input_route${i}`,
			})
			variables.push({
				label: `Input Name ${i}`,
				name: `input_name${i}`,
			})
		}
		this.CHOICES_OUTPUTS.forEach((item) => {
			variables.push({
				label: `Output ${item.id}`,
				name: `output_route${item.id}`,
			})
			variables.push({
				label: `Output Name ${item.id}`,
				name: `output_name${item.id}`,
			})
		})
		this.setVariableDefinitions(variables)
		this.CHOICES_OUTPUTS.forEach((output) => {this.setVariable(`output_route${output.id}`, this.outputRoute[output.id])})
		this.updateMatrixVariables()
		}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will connect to a CYP V8H8HPA HDMI Matrix Switch.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '192.168.0.3',
				regex: this.REGEX_IP,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'IP Port',
				width: 6,
				default: '23',
				regex: this.REGEX_PORT,
			},
			{
				type: 'number',
				id: 'poll_interval',
				label: 'Polling Interval (ms)',
				min: 300,
				max: 30000,
				default: 1000,
				width: 8,
			},
			{
				type: "checkbox",
				id: "polled_data",
				label: "Use polled data from unit    :",
				default: true,
				width: 8,
		 	},
			{
				type: "checkbox",
				id: "log_responses",
				label: "Log returned data    :",
				default: false,
				width: 8,
			},
			{
				type: "checkbox",
				id: "log_tokens",
				label: "Log token data    :",
				default: false,
				width: 8,
			},
		]
	}

	initActions() {
		let actions = {
			select_input: {
				label: 'Select Input',
				options: [
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS
					},
				],
			},
			switch_output: {
				label: 'Switch Output',
				options: [
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: 'A',
						choices: this.CHOICES_OUTPUTS
					},
				],
			},
			input_output: {
				label: 'Input to Output',
				options: [
					{
						type: 'dropdown',
						label: 'Output Port',
						id: 'output',
						default: 'A',
						choices: this.CHOICES_OUTPUTS
					},
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS
					},
				],
			},
			multiple: {
				label: 'Multiple outputs to selected input',
				options: [
					{
						type: 'textinput',
						label: 'Multiple routing (comma separated pairs of outputs/inputs)',
						id: 'pairs',
						default: '',
						},
				],
			},
			all: {
				label: 'All outputs to selected input',
				options: [
					{
						type: 'checkbox',
						label: 'Use selected (or defined input)',
						id: 'selected',
						default: false,
					},
					{
						type: 'dropdown',
						label: 'Input Port',
						id: 'input',
						default: '1',
						choices: this.CHOICES_INPUTS
					},
				],
			},
			preset: {
				label: 'Recall routes from preset number',
				options: [
					{
						type: 'dropdown',
						label: 'Preset number',
						id: 'preset',
						default: '1',
						choices: this.CHOICES_INPUTS
					},
				],
			},
			set_preset: {
				label: 'Set current routes to preset number',
				options: [
					{
						type: 'dropdown',
						label: 'Preset number',
						id: 'preset',
						default: '1',
						choices: this.CHOICES_INPUTS
					},
				],
			},
			mask: {
				label: 'Set mask for output',
				options: [
					{
						type: 'dropdown',
						id: 'output',
						default: 'A',
						choices: this.CHOICES_OUTPUTS
					},
					{
					type: 'dropdown',
					label: 'On / Off / Toggle',
					id: 'onofftoggle',
					default: 'on',
					choices: this.CHOICES_ONOFFTOGGLE
					},
				],
			},
			power: {
				label: 'Power control',
				options: [
					{
						type: 'dropdown',
						label: 'Power control',
						id: 'power',
						default: 'ON',
						choices: this.CHOICES_POWER
					},
				]
			},
		}
		this.setActions(actions)
	}

	action(action) {
		let options = action.options
		switch (action.action) {
			case 'select_input':
				this.selectedInput = options.input
				break
			case 'switch_output':
				this.sendCommmand('SET OUT ' + options.output + ' ROUTE ' + this.selectedInput)
				this.updateRoute(options.output, this.selectedInput)
				break
			case 'input_output':
				this.sendCommmand('SET OUT ' + options.output + ' ROUTE ' + options.input)
				this.updateRoute(options.output,options.input)
				break
			case 'multiple':
				this.sendCommmand('SET OUT ROUTE ' + options.pairs)
				break
			case 'all':
				let myInput = this.selectedInput
				if (!options.selected) {myInput = options.input}
				this.sendCommmand('SET ALL OUT ROUTE ' + myInput)
				for (let key in this.outputRoute) {this.updateRoute(key, myInput)}
				break
			case 'preset':
				this.sendCommmand('SET ROUTE PRESET ' + options.preset)
				break
			case 'set_preset':
				this.sendCommmand('SET CURRENT ROUTE TO PRESET ' + options.preset)
				break
			case 'mask':
				this.sendCommmand('SET OUT ' + options.output + ' MASK ' + this.updateMask(options.output, options.onofftoggle))
				break
			case 'power':
				this.sendCommmand('SET POWER ' + options.power)
				break
		} // note that internal status values are set immediately for feedback responsiveness and will be updated gain when the unit reponds (hopefully with the same value!)
		this.checkFeedbacks()
	}

	initFeedbacks() {
		let feedbacks = {}

		feedbacks['selected'] = {
			type: 'boolean',
			label: 'Status for input',
			description: 'Show feedback selected input',
			options: [
				{
					type: 'dropdown',
					label: 'Input',
					id: 'input',
					default: '1',
					choices: this.CHOICES_INPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.selectedInput == opt.input) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks['output'] = {
			type: 'boolean',
			label: 'Status for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: 'A',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputRoute[opt.output] == this.selectedInput) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks['masked'] = {
			type: 'boolean',
			label: 'Masked for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'dropdown',
					label: 'Output',
					id: 'output',
					default: 'A',
					choices: this.CHOICES_OUTPUTS,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputMask[opt.output] == 'on') {
					return true
				} else {
					return false
				}
			},
		}
		this.setFeedbackDefinitions(feedbacks)
		this.checkFeedbacks()
	}
	initPresets() {
		let presets = []

		const aSelectPreset = (input) => {
			return {
			category: 'Select Input',
			label: 'Select',
			bank: {
				style: 'text',
				text: `$(${this.config.label}:input_name${input})\\n> $(${this.config.label}:input_route${input})`,
				size: 'auto',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'select_input',
					options: {
						input: input,
					},
				},
			],
			feedbacks: [
				{
					type: 'selected',
					options: {
						input: input,
					},
					style: {
						color: this.rgb(0, 0, 0),
						bgcolor: this.rgb(255, 0, 0),
					},
				},
				],
			}
		}
		const aSwitchPreset = (output) => {
			return {
			category: 'Switch Output',
			label: 'Switch',
			bank: {
				style: 'text',
				text: `$(${this.config.label}:output_name${output})\\n< $(${this.config.label}:output_route${output})`,
				size: 'auto',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'switch_output',
					options: {
						output: output,
					},
				},
			],
			feedbacks: [
				{
					type: 'output',
					options: {
						output: output,
					},
					style: {
						color: this.rgb(0, 0, 0),
						bgcolor: this.rgb(0, 255, 0),
					},
				},
				],
			}
		}
		const aMaskPreset = (output) => {
			return {
			category: 'Mask',
			label: 'Mask',
			bank: {
				style: 'text',
				text: `Mask $(${this.config.label}:output_name${output})`,
				size: 'auto',
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0),
			},
			actions: [
				{
					action: 'mask',
					options: {
						output: output,
						onofftoggle: 'toggle'
					},
				},
			],
			feedbacks: [
				{
					type: 'masked',
					options: {
						output: output,
					},
					style: {
						color: this.rgb(0, 0, 0),
						bgcolor: this.rgb(255, 0, 0),
					},
				},
				],
			}
		}

		const anAllPreset = (input) => {
			return {
			category: 'All',
			label: 'All',
			bank: {
				style: 'text',
				text: `All\\n$(${this.config.label}:input_name${input})`,
				size: '18',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(32, 0, 0),
			},
			actions: [
				{
					action: 'all',
					options: {
						selected: false,
						input: input,
					},
				},
			],
		}}

		this.CHOICES_INPUTS.forEach((input) => {presets.push(aSelectPreset(input.id)) });
		this.CHOICES_OUTPUTS.forEach((output) => {presets.push(aSwitchPreset(output.id)) });
		this.CHOICES_OUTPUTS.forEach((output) => {presets.push(aMaskPreset(output.id)) });
		this.CHOICES_INPUTS.forEach((input) => {presets.push(anAllPreset(input.id)) });

			presets.push({
			category: 'In to Out',
			label: 'In to Out',
			bank: {
				style: 'text',
				text: 'In to Out',
				size: 'auto',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'input_output',
					options: {
						input: '1',
						output: 'A',
						select:false,
					},
				},
			],
		})

		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance;