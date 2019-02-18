import Vue from "vue";

import Vuex from "vuex";
Vue.use(Vuex);

// Time plugin
import duration from "./plugins/duration.js";
Vue.use(duration);

// Synchronize JS interval timers
import * as workerTimers from "worker-timers";
Object.defineProperty(Vue.prototype, "$workerTimers", { value: workerTimers });

import nanoid from "nanoid";

let _app = new Vue();

export default new Vuex.Store({
  state: {
    taskList: [],
    currentTask: null,
    timer: null,
    timerRunning: false
  },
  getters: {
    taskFilter: state => option => {
      switch (option) {
        case "all":
          return state.taskList;
        case "todo":
          return state.taskList.filter(task => task.complete == false);
        case "current":
          return state.currentTask;
        case "complete":
          return state.taskList.filter(task => task.complete == true);
        default:
          throw new Error(
            `Unknown option ${option} in taskFilter of "all", "todo", "current", complete"`
          );
      }
    },
    taskLength: (_, getters) => option => getters.taskFilter(option).length,
    // Generate readable versions of task properties
    readable: _ => (
      list,
      option,
      readableOption = "clock",
      filterFunction = null
    ) => {
      switch (option) {
        case "all":
          return list.map(item => ({
            ...item,
            duration: _app.$duration.durationMomentToString(
              item.duration,
              readableOption
            )
          }));
        case "one":
          break;
        default:
          break;
      }
    },
    // taskListLength: (state, getters) => state.taskList.length,
    todoTaskList: state =>
      state.taskList.filter(task => task.complete == false),
    completedTaskList: state =>
      state.taskList.filter(task => task.complete == true),
    completedCurrentTask: state => {
      /* If the timer runs to zero (every time value is 0)
      then the task has been completed and can be moved to the completed array */
      if (state.currentTask)
        return Object.values(state.currentTask.duration._data).every(
          value => value == 0
        );
      else return false;
    },
    readableTaskList: (state, getters) =>
      getters.readable(state.taskList, "all"),
    readableCurrentTask: state => {
      if (state.currentTask) {
        return {
          ...state.currentTask,
          duration: _app.$duration.durationMomentToString(
            state.currentTask.duration,
            "clock"
          )
        };
      } else return false;
    },
    readableTotalTime: state => {
      // function to add durations together
      const durationAdder = (accumulator, element) => accumulator.add(element);
      /* Extract duration from each TaskItem
      and use durationAdder function to add them together.
      Classic map-reduce use case */
      let zeroDuration = _app.$moment.duration(0);
      let rawTime = state.taskList
        .map(task => task.duration)
        .reduce(durationAdder, zeroDuration);

      return _app.$duration.durationMomentToString(rawTime, "clock");
    },
    timerRunning: state => state.timerRunning
  },
  mutations: {
    addTask: (state, task) => state.taskList.push(task),
    deleteTask: (state, index) =>
      state.taskList.length > 0 ? state.taskList.splice(index, 1) : null,
    completeTask: (state, index) =>
      (state.taskList[index].complete =
        state.taskList.length > 0 ? true : false),
    setCurrentTask: state =>
      (state.currentTask =
        state.taskList.length > 0 ? state.taskList[0] : null),
    setTimerRunning(state, value) {
      state.timerRunning = value;
    },
    incrementTaskTime(state, { timeValue, timeType }) {
      state.currentTask.duration.add(timeValue, timeType);
    },
    decrementTaskTime(state, { timeValue, timeType }) {
      state.currentTask.duration.subtract(timeValue, timeType);
    }
  },
  actions: {
    async addTask(context, task) {
      let parsedDuration = _app.$duration.stringToDurationMoment(task.duration);
      let parsedTask = {
        title: task.title,
        duration: parsedDuration
      };
      if (
        parsedDuration &&
        (await context.dispatch("validateTask", parsedTask))
      ) {
        // Vue.set(task, "id", nanoid());
        // Vue.set(task, "complete", false);
        parsedTask.id = nanoid();
        parsedTask.complete = false;
        await context.commit("addTask", parsedTask);
        context.dispatch("setCurrentTask");
      } else throw new Error("Task not validated");
    },
    async deleteTask(context, taskId) {
      let index = await context.dispatch("getIndexById", taskId);
      await context.commit("deleteTask", index);
      context.dispatch("setCurrentTask");
    },
    async completeTask(context) {
      await context.commit("completeTask", 0);
      context.dispatch("setCurrentTask");
    },
    async validateTask(context, task) {
      let titleValidated = await context.dispatch("validateTitle", task);
      let durationValidated = await context.dispatch("validateDuration", task);
      return titleValidated && durationValidated;
    },
    validateDuration(_, { duration }) {
      if (duration) {
        let zeroDuration = _app.$duration.zero();
        // FIXME: Edge case with >24 hour tasks
        if (
          duration.hours() > zeroDuration.hours() ||
          duration.minutes() > zeroDuration.minutes() ||
          duration.seconds() > zeroDuration.seconds()
        )
          return true;
        else return false;
      } else return false;
    },
    validateTitle(_, { title }) {
      return title.length > 0;
    },
    incrementTaskTime(context, { timeValue, timeType }) {
      context.commit("incrementTaskTime", { timeValue, timeType });
    },
    decrementTaskTime(context, { timeValue, timeType }) {
      if (context.state.currentTask) {
        context.commit("decrementTaskTime", { timeValue, timeType });
      }
    },
    startTimer(context) {
      context.commit("setTimerRunning", true);
      context.state.timer = _app.$workerTimers.setInterval(() => {
        context.dispatch("decrementTaskTime", { timeValue: 1, timeType: "s" });
      }, 1000);
    },
    pauseTimer(context) {
      context.commit("setTimerRunning", false);
      _app.$workerTimers.clearInterval(context.state.timer);
      context.state.timer = null;
    },
    setCurrentTask(context) {
      context.commit("setCurrentTask");
    },
    async getIndexById(context, id) {
      let index = await context.state.taskList.findIndex(
        element => element.id == id
      );
      if (index > -1) return index;
      else throw new Error("Index not found");
    }
  }
});
