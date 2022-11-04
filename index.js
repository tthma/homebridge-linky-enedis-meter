


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

	this.EntryAdded = false;
	this.log = log;
	this.usagePointId = config["usagePointId"] || "";
	this.accessToken = config["accessToken"] || "";
	this.refreshToken = config["refreshToken"] || "";

	this.name = config["name"];
	this.displayName = config["name"];

	try {
		this.configFirstDate = new Date(config["firstDateRecord"]);
		this.configFirstDate.setHours(0, 0, 0, 0);
	} catch (error) {
		this.configFirstDate = this.getdatenow();
		this.configFirstDate.setHours(0, 0, 0, 0);
	}


	this.update_interval = config["update_interval"] || 60000;

	this.serial = this.usagePointId;
	// internal variables
	this.waiting_response = false;
	this.ResetCall = false;

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

		this.addOptionalCharacteristic(EveTotalConsumption);

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

	this.service.addCharacteristic(this._EveTotalConsumption).on('get', this.getTotalConsumption.bind(this));

	this.service.addCharacteristic(this._EveResetHistory).on('set', this.setResetEvent.bind(this));;

	this.powerConsumption = 0;
	this.totalPowerConsumption = 0;
	this.voltage1 = 220;
	this.ampere1 = 0;



	this.historyService = new FakeGatoHistoryService("energy", this, { filename: this.serial + ".json", disableRepeatLastData: true, disableTimer: true, storage: 'fs' });

	this.storagePath = path.join(
		this.historyService.path,
		`${config.accessory}.${PowerMeterService.UUID}.json`
	);

	this.loadState();

	if (this.fsfirstToken != this.accessToken || this.fsfirstrefreshtoken != this.refreshToken || this.fstoken == '') {
		this.fsfirstToken = this.accessToken;
		this.fsfirstrefreshtoken = this.refreshToken;
		this.fstoken = this.accessToken;
		this.fsrefreshtoken = this.refreshToken;
		this.saveState();
	}


	this.session = new Linky.Session({
		accessToken: this.fstoken,
		refreshToken: this.fsrefreshtoken,
		usagePointId: this.usagePointId,
		onTokenRefresh: (accessToken, refreshToken) => {
			console.log("refreshtoken");


			this.fstoken = accessToken;
			this.fsrefreshtoken = refreshToken;
			if (accessToken === "" || refreshToken === "" ) {
				this.log('Error Refreshing Token please renew it !');
			}else{
				this.saveState();
			}
			

		},
	});


};

EnergyMeter.prototype.loadState = function () {
	try {
		let rawFile = '{}';
		if (fs.existsSync(this.storagePath)) {
			rawFile = fs.readFileSync(this.storagePath, 'utf8');
		}

		const stored = JSON.parse(rawFile);

		this.fsfirstToken = stored.fsfirstToken || "";
		this.fsfirstrefreshtoken = stored.fsfirstrefreshtoken || "";
		this.fstoken = stored.fstoken || "";
		this.fsrefreshtoken = stored.fsrefreshtoken || "";
		this.historyService.currentEntry = stored.uploadEntry || 0;
		this.totalPowerConsumption = stored.total || 0;
		try {
			if (stored.firstdate == undefined) {
				this.firstdate = new Date(this.configFirstDate);
			} else {
				this.firstdate = new Date(stored.firstdate) ;
				this.firstdate.setHours(0,-this.firstdate.getTimezoneOffset(),0,0);
			}
		} catch (error) {
			this.firstdate = this.getdatenow();
			this.firstdate.setHours(0, 0, 0, 0);
		}

	} catch (error) {
		fs.writeFileSync(
			this.storagePath,
			JSON.stringify({
				fsfirstToken: this.fsfirstToken,
				fsfirstrefreshtoken: this.fsfirstrefreshtoken,
				fstoken: this.fstoken,
				fsrefreshtoken: this.fsrefreshtoken,
				firstdate: this.firstdate,
				uploadEntry: this.historyService.currentEntry,
				total: this.totalPowerConsumption

			})
		);
	}
};


EnergyMeter.prototype.saveState = function () {

if(this.firstdate != undefined){
	this.firstdate.setHours(0, 0, 0, 0);

}

	fs.writeFileSync(
		this.storagePath,
		JSON.stringify({
			fsfirstToken: this.fsfirstToken,
			fsfirstrefreshtoken: this.fsfirstrefreshtoken,
			fstoken: this.fstoken,
			fsrefreshtoken: this.fsrefreshtoken,
			firstdate: this.firstdate,
			uploadEntry: this.historyService.currentEntry,
			total: this.totalPowerConsumption

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


function compareNumbers(a, b) {
	return a.time - b.time;
}


EnergyMeter.prototype.updateState = function () {

	if (this.ResetCall) {

		return;
	}

	//Check if hours is under 05:00 for prevent 404 No Data Error
	//or Error: Invalid request: The end date parameter must be earlier than the current date. 
	if(new Date().getHours() <=5){
		return;
	}

	if (this.waiting_response) {
		this.log('Please select a higher update_interval value. Querry command may not finish!');
		return;
	}
	this.waiting_response = true;

	this.last_value = new Promise((resolve, reject) => {

		var datenow = this.getdatenow();

		if (this.EntryAdded && this.historyService.history.length == 1) {

			this.setResetEvent();
			throw new Error("Error writing history must reset");
		}

		if (this.historyService.loaded) {

			if (pHomebridge.globalFakeGatoStorage != undefined) {

				if (pHomebridge.globalFakeGatoStorage.writing) {
					this.waiting_response = false;
					resolve();
					return true;
				}
			}

			if (this.historyService.transfer) {

				if (this.historyService.currentEntry >= this.historyService.lastEntry) {
					this.historyService.transfer = false;
					this.waiting_response = true;
					this.EntryAdded = false;
					this.log('Transfer to Eve App Finish');
					this.historyService.currentEntry = 0;
					this.historyService.cleanPersist();
					this.historyService.history = ["noValue"];
					this.historyService.load((arg, boolvalue) => {

					});
					this.saveState();
					this.waiting_response = false;
					resolve();
					return true;
				}

				this.log('Wait pending transfer to Eve App');
				this.waiting_response = false;
				resolve();
				return true;
			}

			if ((this.historyService.lastEntry - this.historyService.firstEntry) >= (this.historyService.memorySize - 145) && this.historyService.currentEntry < this.historyService.lastEntry) {

				if ((this.historyService.lastEntry - this.historyService.currentEntry) >= (this.historyService.memorySize - 145)) {

					this.log('Persit Memory Full Please push data to Eve App (Refresh) For Prevent lost Data History');
					this.waiting_response = false;
					resolve();
					return true;
				}

			}



		} else {

			this.historyService.load();
			this.waiting_response = false;
			resolve();
			return true;
		}

		this.service.getCharacteristic(this._EveTotalConsumption).setValue(this.totalPowerConsumption, undefined, undefined);

		if (this.firstdate.getDate() == datenow.getDate() && this.firstdate.getMonth() == datenow.getMonth() && this.firstdate.getFullYear() == datenow.getFullYear()) {

			this.waiting_response = false;
			resolve();
			return true;
		}

		var date = new Date(this.firstdate.valueOf());


		date.setDate(date.getDate() + 7);

		var dateseek = date;

		if (dateseek.getTime() > datenow.getTime()) {
			var TotalDays = Math.ceil((datenow - this.firstdate) / (1000 * 3600 * 24));
			date = new Date(this.firstdate.valueOf());
			date.setDate(date.getDate() + TotalDays);
			dateseek = date;
		}

		if (dateseek.getTime() > datenow.getTime()) {
			dateseek = this.getdatenow();
			dateseek.setHours(0, 0, 0, 0);
		}

		if (dateseek.getTime() === this.firstdate.getTime()) {

			this.saveState();
			this.waiting_response = false;
			resolve();
			return true;
		}

		if (this.firstdate.getMonth() < dateseek.getMonth()) {
			this.totalPowerConsumption = 0;
		}
	 
		this.firstdate.setHours(0,-this.firstdate.getTimezoneOffset(),0,0);
		dateseek.setHours(0,-dateseek.getTimezoneOffset(),0,0);





		this.log('Query start = ' + this.firstdate.toISOString().split("T")[0] + ' End = ' + dateseek.toISOString().split("T")[0]);

		var error;

		this.PowerComsuption = 0;


		this.session.getLoadCurve(new Date(this.firstdate).toISOString().split("T")[0], new Date(dateseek).toISOString().split("T")[0])
			.catch((errorparsed) => {
				this.log.error(errorparsed);

				error = errorparsed;
			})
			.then(async (json) => {


				if (!error) {


					var mindate = Date.parse(json.data[0].date);
					var maxdate = Date.parse(json.data[json.data.length - 1].date);

					var preval = undefined;
					while (mindate <= maxdate) {

						var val = json.data.find(felement => Date.parse(felement.date) == mindate)

						if (val != undefined) { preval = val; }
						if (preval != undefined) {

							var findvalue = this.historyService.history.find(felement => felement.time == Math.round(mindate / 1000));
							if (findvalue == undefined) {

								if (val != undefined) {
									if (new Date(val.date).getMonth() == datenow.getMonth() && new Date(val.date).getFullYear() == datenow.getFullYear()) {
										if (Number.isInteger(val.value)) {
											this.totalPowerConsumption = this.totalPowerConsumption + ((val.value / 1000) / 2);
										}
									}
								}

								this.historyService.addEntry({ time: Math.round(mindate / 1000), power: (preval.value) });
								this.EntryAdded = true;

							}
						}

						mindate = mindate + 600000;
					}
					this.log('Query ' + this.firstdate.toISOString().split("T")[0] + '/' + dateseek.toISOString().split("T")[0]+' Finish');

					this.firstdate = dateseek;

					this.saveState();
					
					resolve();
				
				} else {
					reject(error);

				}
				json = undefined;
				return true;
			});
	}).catch(
		(error) => {
			this.log.error(error);

		}

	).then(() => {
		this.service.getCharacteristic(this._EveTotalConsumption).setValue(this.totalPowerConsumption, undefined, undefined);
		this.waiting_response = false;
		return true;
	}).finally(() => {
		this.last_value = undefined;
	})

};

async function sleep(msec) {
	return new Promise(resolve => setTimeout(resolve, msec));
}
function getHoursDiff(startDate, endDate) {
	const msInHour = 1000 * 60 * 60;

	return Math.round(Math.abs(endDate - startDate) / msInHour);
}

EnergyMeter.prototype.setResetEvent = function (callback) {
	this.firstdate = this.configFirstDate;
	this.EntryAdded = false;
	this.historyService.currentEntry = 0;
	this.totalPowerConsumption = 0;
	this.saveState();

	this.log("Reset Detected From EVE App must Restart HomeBridge");
	if (this.historyService != null) {
		this.historyService.cleanPersist();
		fs.unlinkSync(path.join(this.historyService.path, this.historyService.filename));
	}
	this.ResetCall = true;

};

EnergyMeter.prototype.getdatenow = function () {
	var date = new Date();
	date.getHours( );
	date.setHours(12, 0, 0, 0);
	return date;
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
