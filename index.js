


var inherits = require('util').inherits;
var Service, Characteristic, pHomebridge;
var request = require('request');
var fs = require('fs');
var path = require('path');
var FakeGatoHistoryService = require('fakegato-history');
const { fail } = require('assert');
const version = require('./package.json').version;
var Linky = require('linky');
const fakegatoStorage = require('fakegato-history/fakegato-storage');
const consoleerror = require('console');
module.exports = function (homebridge) {

	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	pHomebridge = homebridge;
	hap = homebridge.hap;
	FakeGatoHistoryService = require('fakegato-history')(homebridge);
	homebridge.registerAccessory("homebridge-linky-enedis-meter", "EnergyMeter", EnergyMeter);

}

function EnergyMeter(log, config) {



	this.log = log;
	this.usagePointId = config["usagePointId"] || "";
	this.accessToken = config["accessToken"] || "";
	this.refreshToken = config["refreshToken"] || "";

	this.name = config["name"];
	this.displayName = config["name"];

	try {
		this.configFirstDate = Date.parse(config["firstDateRecord"]);
	} catch (error) {
		this.configFirstDate = new Date().toISOString().split("T")[0];
	}

	this.update_interval = Number(config["update_interval"] || 10000);
	this.serial = this.usagePointId;
	// internal variables
	this.waiting_response = false;


	var EvePowerConsumption = function () {
		Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT16,
			unit: "Watts",
			maxValue: 100000,
			minValue: 0,
			minStep: 1,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	EvePowerConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
	inherits(EvePowerConsumption, Characteristic);

	var EveTotalConsumption = function () {
		Characteristic.call(this, 'Energy', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.FLOAT,
			unit: 'kWh',
			maxValue: 1000000000,
			minValue: 0,
			minStep: 0.001,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	EveTotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
	inherits(EveTotalConsumption, Characteristic);

	var EveVoltage1 = function () {
		Characteristic.call(this, 'Volt', 'E863F10A-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.FLOAT,
			unit: 'Volt',
			maxValue: 1000000000,
			minValue: 0,
			minStep: 0.001,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};
	EveVoltage1.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';
	inherits(EveVoltage1, Characteristic);

	var EveAmpere1 = function () {
		Characteristic.call(this, 'Ampere', 'E863F126-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.FLOAT,
			unit: 'Ampere',
			maxValue: 1000000000,
			minValue: 0,
			minStep: 0.001,
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
		});
		this.value = this.getDefaultValue();
	};


	EveAmpere1.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';
	inherits(EveAmpere1, Characteristic);

	var EveResetHistory = function () {
		Characteristic.call(this, 'Time from totalizer reset', 'E863F112-079E-48FF-8F27-9C2605A29F52');
		this.setProps({
			format: Characteristic.Formats.UINT32,
			unit: 'Time from totalizer reset',
			perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE]
		});
		this.value = this.getDefaultValue();

	};

	EveResetHistory.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';
	inherits(EveResetHistory, Characteristic);


	var PowerMeterService = function (displayName, subtype) {
		Service.call(this, displayName, '00000001-0000-1777-8000-775D67EC4377', subtype);
		this.addCharacteristic(EvePowerConsumption);
		this.addOptionalCharacteristic(EveTotalConsumption);
		this.addOptionalCharacteristic(EveVoltage1);
		this.addOptionalCharacteristic(EveAmpere1);
		this.addOptionalCharacteristic(EveResetHistory);
	};
	PowerMeterService.UUID = '00000001-0000-1777-8000-775D67EC4377';
	inherits(PowerMeterService, Service);

	// local vars
	this._EveResetHistory = EveResetHistory;
	this._EvePowerConsumption = EvePowerConsumption;
	this._EveTotalConsumption = EveTotalConsumption;
	this._EveVoltage1 = EveVoltage1;
	this._EveAmpere1 = EveAmpere1;

	// info
	this.informationService = new Service.AccessoryInformation();
	this.informationService
		.setCharacteristic(Characteristic.Manufacturer, "Linky - Enedis")
		.setCharacteristic(Characteristic.Model, "Linky")
		.setCharacteristic(Characteristic.FirmwareRevision, version)
		.setCharacteristic(Characteristic.SerialNumber, this.serial);

	// construct service
	this.service = new PowerMeterService(this.name);
	this.service.getCharacteristic(this._EvePowerConsumption).on('get', this.getPowerConsumption.bind(this));
	this.service.addCharacteristic(this._EveTotalConsumption).on('get', this.getTotalConsumption.bind(this));
	this.service.addCharacteristic(this._EveVoltage1).on('get', this.getVoltage1.bind(this));
	this.service.addCharacteristic(this._EveAmpere1).on('get', this.getAmpere1.bind(this));
	this.service.addCharacteristic(this._EveResetHistory).on('set', this.setResetEvent.bind(this));;
	// add fakegato
	this.historyService = new FakeGatoHistoryService("energy", this, { size: 18000, disableTimer: true, disableRepeatLastData: true, storage: 'fs' });

	this.storagePath = path.join(
		this.historyService.path,
		`${config.accessory}.${PowerMeterService.UUID}.json`
	);

	this.loadState();

	if (this.fsfirstToken == "" && this.fsrefreshtoken == "" || (this.fsfirstToken != this.accessToken || this.fsfirstrefreshtoken != this.refreshToken)) {
		this.fsfirstToken = this.accessToken;
		this.fsfirstrefreshtoken = this.refreshToken;
		this.fstoken = this.accessToken;
		this.fsrefreshtoken = this.refreshToken;
		this.saveState();
	}

};

EnergyMeter.prototype.loadState = function () {
	let rawFile = '{}';
	if (fs.existsSync(this.storagePath)) {
		rawFile = fs.readFileSync(this.storagePath, 'utf8');
	}

	const stored = JSON.parse(rawFile);

	this.fsfirstToken = stored.fsfirstToken || "";
	this.fsfirstrefreshtoken = stored.fsfirstrefreshtoken || "";
	this.fstoken = stored.fstoken || "";
	this.fsrefreshtoken = stored.fsrefreshtoken || "";

};


EnergyMeter.prototype.saveState = function () {
	fs.writeFileSync(
		this.storagePath,
		JSON.stringify({
			fsfirstToken: this.fsfirstToken,
			fsfirstrefreshtoken: this.fsfirstrefreshtoken,
			fstoken: this.fstoken,
			fsrefreshtoken: this.fsrefreshtoken,

		})
	);
}

Date.prototype.addDays = function (days) {
	var date = new Date(this.valueOf());
	date.setDate(date.getDate() + days);
	return date;
};
function toDateTime(secs) {
	var t = new Date(1970, 0, 1); // Epoch
	t.setSeconds(secs);
	return t;
}
EnergyMeter.prototype.updateState = function () {

	if (this.waiting_response) {
		this.log('Please select a higher update_interval value. Http command may not finish!');
		return;
	}

	this.last_value = new Promise((resolve, reject) => {

		var datenow = new Date();

		if (this.historyService.history.length == 1) {

			var firstdate = new Date(datenow.getFullYear() - 1, datenow.getMonth(), datenow.getDate());
			var dateconfig = Date.parse(this.configFirstDate);
		 
			var TotalDays = Math.ceil((datenow - dateconfig) / (1000 * 3600 * 24));


			if (TotalDays <= 365) {
				firstdate = dateconfig;
			}
		} else {

			var firstdate = new Date(parseInt(this.historyService.history[this.historyService.history.length - 1].time * 1000, 10));

			if (firstdate.getMonth() != datenow.getMonth()) {
				this.PowerComsuption = 0;
			}
			if (firstdate.getDate() == datenow.getDate() && firstdate.getMonth() == datenow.getMonth() && firstdate.getFullYear() == datenow.getFullYear()) {
				clearInterval(this.timer);
				this.update_interval = 600000;
				this.timer = setInterval(this.updateState.bind(this), this.update_interval);
				this.log("Push Request set to 10min");
				return;
			}

		}
		var date = new Date(firstdate.valueOf());


		date.setDate(date.getDate() + 7);

		var dateseek = date;

		if (dateseek > datenow) {
			var TotalDays = Math.ceil((datenow - firstdate) / (1000 * 3600 * 24));

			date = new Date(firstdate.valueOf());
			date.setDate(date.getDate() + TotalDays);
			dateseek = date;


		}
		if (dateseek >= datenow) {
			dateseek = new Date();
		}
		if (dateseek == firstdate) {
			clearInterval(this.timer);
			this.update_interval = 600000;
			this.timer = setInterval(this.updateState.bind(this), this.update_interval);
			this.log("Push Request set to 10min");
			this.waiting_response = false;
			return;
		}


		this.log('Query start = ' + new Date(firstdate).toISOString().split("T")[0] + ' End = ' + new Date(dateseek).toISOString().split("T")[0]);
		clearInterval(this.timer);
		this.update_interval = 5000;
		this.timer = setInterval(this.updateState.bind(this), this.update_interval);
		var error;
		this.waiting_response = true;

		this.PowerComsuption = 0;
		var session = new Linky.Session({
			accessToken: this.fstoken,
			refreshToken: this.fsrefreshtoken,
			usagePointId: this.usagePointId,
			onTokenRefresh: (accessToken, refreshToken) => {
				console.log("refreshtoken");


				this.fstoken = accessToken;
				this.fsrefreshtoken = refreshToken;
				this.saveState();
				// Cette fonction sera appelée si les tokens sont renouvelés
				// Les tokens précédents ne seront plus valides
				// Il faudra utiliser ces nouveaux tokens à la prochaine création de session
				// Si accessToken et refreshToken sont vides, cela signifie que les tokens ne peuvent plus
				// être utilisés. Il faut alors en récupérer des nouveaux sur conso.vercel.app
			},
		});

		// if(dateseek == firstdate){

		// }



		session.getLoadCurve(new Date(firstdate).toISOString().split("T")[0], new Date(dateseek).toISOString().split("T")[0])
			.catch((errorparsed) => {
				this.log.error(errorparsed);

				error = errorparsed;
			})
			.then((json) => {


				if (!error) {

					var hyst = {};
					try {
						this.historyService.history.forEach(element => {

							if (element.time != undefined) {

								hyst[element.time] = true;
							}
						});

					} catch (error) {
						reject(error);
						this.waiting_response = false;
						return;
					}

					json.data.forEach(element => {
						var dt = Date.parse(element.date);

						if (hyst[Math.round(dt / 1000)] == undefined) {
							this.historyService.addEntry({ time: Math.round(dt / 1000), power: parseInt(element.value) });

						}

					});
					resolve();
				} else {
					reject(error);

				}
			});
	}).catch(
		(error) => {
			this.log.error(error);
			this.waiting_response = false;
		}

	).then(() => {

		this.waiting_response = false;
	});

};


EnergyMeter.prototype.setResetEvent = function (callback) {
	clearInterval(this.timer);
	this.update_interval = 5000;
	this.timer = setInterval(this.updateState.bind(this), this.update_interval);
	this.log("Reset Detected From EVE App");
	if (this.historyService != null) {
		this.historyService.cleanPersist();

		this.historyService = new FakeGatoHistoryService("energy", this, { size: 18000, disableTimer: true, disableRepeatLastData: true, storage: 'fs' });
		this.historyService.history = ["noValue"];
		this.historyService.cleanPersist();
		//this.historyService = new FakeGatoHistoryService("energy", this, { size: 18000, disableTimer: true, disableRepeatLastData: true, storage: 'fs' });

	}

};

EnergyMeter.prototype.getResetEvent = function (callback) {
	callback(null, this.resetvalue);

};

EnergyMeter.prototype.getPowerConsumption = function (callback) {
	callback(null, this.powerConsumption);
};


EnergyMeter.prototype.getTotalConsumption = function (callback) {
	callback(null, this.totalPowerConsumption);
};

EnergyMeter.prototype.getVoltage1 = function (callback) {
	callback(null, this.voltage1);
};

EnergyMeter.prototype.getAmpere1 = function (callback) {
	callback(null, this.ampere1);
};

EnergyMeter.prototype.getServices = function () {
	this.log("getServices: " + this.name);
	if (this.update_interval > 0) {
		this.timer = setInterval(this.updateState.bind(this), this.update_interval);
	}
	return [this.informationService, this.service, this.historyService];
};
