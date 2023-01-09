// 当读取对象属性时，把副作用函数放进桶里；当设置属性时，把副作用函数从桶里取出并执行
let affectFunction = null;
// effect栈
let effectStact = [];

// 一个标记变量，代表是否进行追踪。默认值为 true，即允许追踪
let shouldTrack = true;

// 重写数组方法
const arrayMethods = {};
// 重写数组方法
['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
    const originMethod = Array.prototype[method];
    arrayMethods[method] = function(...args) {
        let res = originMethod.apply(this, args);
        if (res === false || res === -1) {
            res = originMethod.apply(this.raw, args);
        }
        return res;
    }
});

// 重写数组方法
['push', 'pop', 'shift', 'unshift', 'splice '].forEach(method => {
    const originMethod = Array.prototype[method];
    arrayMethods[method] = function(...args) {
        shouldTrack = false;
        let res = originMethod.apply(this, args);
        shouldTrack = true;
        return res;
    }
})

const mutableInstrumentations = {
    add(key) {
        // this仍然指向代理对象
        const target = this.raw;
        const hasKey = target.has(key);
        const res = target.add(key);
        if (!hasKey) {
            trigger(target, ITERATE_KEY, 'ADD');
        }
        return res;
    },
    delete(key) {
        // this仍然指向代理对象
        const target = this.raw;
        const hasKey = target.has(key);
        const res = target.delete(key);
        if (hasKey) {
            trigger(target, ITERATE_KEY, 'DELETE');
        }
        return res;
    }
}

// 注册副作用函数的函数
function effect(fn, option = {}) {
    function effectFn() {
        clearFn(effectFn);
        affectFunction = effectFn;
        effectStact.push(effectFn);
        const result = fn();
        effectStact.pop();
        affectFunction = effectStact[effectStact.length - 1];
        return result;
    }
    effectFn.relySet = [];
    effectFn.option = option;
    if (!option.lazy) {
        effectFn();
    }
    return effectFn;

}

function clearFn(effectFn) {
    for (let rely of effectFn.relySet) {
        rely.delete(effectFn);
    }
    effectFn.relySet.length = 0;
}

const bucket = new WeakMap(); //当代理的对象不要时，该对象不会再使用，因此该及时回收对象，使用WeakMap不影响对象的垃圾回收

// 追踪函数
function track(target, key) {
    if (!affectFunction || !shouldTrack) {
        return;
    }
    let keyMap = bucket.get(target);
    if (!keyMap) {
        bucket.set(target, (keyMap = new Map()));
    }
    let relySet = keyMap.get(key);
    if (!relySet) {
        keyMap.set(key, (relySet = new Set()));
    }
    relySet.add(affectFunction);
    affectFunction.relySet.push(relySet);
}


const ITERATE_KEY = Symbol();
// 触发函数
// type：判断操作是属于修改属性值还是增加属性、删除属性等
function trigger(target, key, type, newVal) {
    let keyMap = bucket.get(target);
    if (!keyMap) {
        return
    }


    let relySet = keyMap.get(key);
    const effectToRun = new Set();
    relySet && relySet.forEach(effectFn => {
        if (effectFn !== affectFunction) {
            effectToRun.add(effectFn);
        }
    })
    if (type === 'ADD' && Array.isArray(target)) {
        const lengthEffects = keyMap.get('length');
        lengthEffects && lengthEffects.forEach(effectFn => {
            if (effectFn != affectFunction) {
                effectToRun.add(effectFn);
            }
        })
    }

    if (Array.isArray(target) && key === 'length') {
        keyMap.forEach((effects, key) => {
            if (key >= newVal) {
                effects.forEach(effectFn => {
                    if (effectFn !== affectFunction) {
                        effectToRun.add(effectFn);
                    }
                })
            }
        })
    }

    if (type === 'ADD' || type === 'DELETE') {
        const iterateSet = keyMap.get(ITERATE_KEY);
        iterateSet && iterateSet.forEach(effectFn => {
            if (effectFn !== affectFunction) {
                effectToRun.add(effectFn);
            }
        })
    }


    effectToRun.forEach(effectFn => {
        if (effectFn.option.scheduler) {
            effectFn.option.scheduler(effectFn)
        } else {
            effectFn();
        }
    });
    // relySet && relySet.forEach((fn) => fn());
}

// 实现计算属性
function computed(getter) {
    let value;
    let dirty = true;
    const effectFn = effect(getter, {
        lazy: true,
        scheduler() {
            dirty = true;
            trigger(obj, 'value');
        }
    })
    let obj = {
        get value() {
            if (dirty) {
                value = effectFn();
                dirty = false;
            }
            track(obj, 'value')
            return value;
        }
    }
    return obj;
}

// 实现watch
function watch(source, cb, option = {}) {
    let getter;
    let oldVal, newVal;
    let cleanup; // 用来存储用户过期的回调
    if (typeof source === 'function') {
        getter = source;
    } else {
        getter = () => traverse(source);
    }

    function onInvalidate(fn) {
        cleanup = fn;
    }
    const job = () => {
        newVal = effectFn();
        if (cleanup) {
            cleanup();
        }
        cb(newVal, oldVal, onInvalidate);
        oldVal = newVal;
    }

    const effectFn = effect(() => getter(), {
        lazy: true,
        scheduler() {
            if (option.flush === 'post') {
                const p = Promise.resolve();
                p.then(job());
            } else {
                job()
            }
        }
    });
    if (option.immediate === true) {
        job();
    } else {
        oldVal = effectFn();
    }
}

// 遍历对象的属性
function traverse(source, seen = new Set()) {
    if (typeof source !== 'object' || source === null || seen.has(source)) {
        return
    }
    seen.add(source);
    for (const k in source) {

        traverse(source[k], seen);
    }
}

// 封装 createReactive 函数，接收一个参数 isShallow，代表是否为浅响应，默认为 false，即非浅响应

function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            // 代理对象可以通过raw属性返回被代理的对象
            if (key === 'raw') {
                return target;
            }

            if (key === 'size') {
                track(target, ITERATE_KEY)
                return Reflect.get(target, key, target);
            }
            // 与用Reflect绑定this值有什么区别
            if (key === 'delete') {
                // return target[key].bind(target);
                return mutableInstrumentations.delete;
            }
            if (key === 'add') {
                return mutableInstrumentations[key];
            }
            if (!isReadonly || typeof key !== 'symbol') {
                track(target, key);
            }

            if (Array.isArray(target) && arrayMethods.hasOwnProperty(key)) {
                return Reflect.get(arrayMethods, key, receiver);
            }

            const res = Reflect.get(target, key, receiver);
            if (isShallow) {
                return res;
            }
            if (typeof res === 'object' && res !== null) {
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;

        },
        set(target, key, newValue, receiver) {
            if (isReadonly) {
                console.warn(`属性${key}是只读的`);
                return true;
            }

            const oldValue = target[key];
            // 数组：如果给数组赋值的位置大于数组本身的大小，则会影响数组的length属性；  
            // 如果属性不存在，则说明是在添加新属性，否则是设置已有属性
            const type = Array.isArray(target) ? Number(key) < target.length ? 'SET' : 'ADD' : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD';
            // target[key] = newValue;
            const res = Reflect.set(target, key, newValue, receiver);
            // target === receiver.raw 说明 receiver 就是 target 的代理对象
            if (target === receiver.raw) {
                // 比较新值与旧值，只有当它们不全等，并且不都是 NaN 的时候才触发响应
                if (oldValue !== newValue && (oldValue === oldValue || newValue === newValue)) {
                    trigger(target, key, type, newValue);
                }
            }

            return res
        },
        // 拦截in操作符
        has(target, key) {
            track(target, key);
            return Reflect.has(target, key);
        },
        // 拦截for...in操作
        ownKeys(target) {
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
            return Reflect.ownKeys(target)
        },
        // 拦截删除属性操作
        deleteProperty(target, key) {
            if (isReadonly) {
                console.warn(`属性${key}是只读的`);
                return true;
            }

            // 判断对象是否有key属性，
            const hadKey = Object.prototype.hasOwnProperty.call(target, key);
            // 删除对象操作，对象属性不存在时进行该操作返回true
            const res = Reflect.deleteProperty(target, key);
            if (hadKey && res) {
                // 删除属性时会触发for...in操作
                trigger(target, key, 'DELETE')
            }
        }
    })
}





const reactiveMap = new Map();
// 响应函数
function reactive(obj) {
    const existReactive = reactiveMap.get(obj);
    if (existReactive) {
        return existReactive;
    }
    const proxy = createReactive(obj);
    reactiveMap.set(obj, proxy);
    return proxy;
    // return createReactive(obj);
}

function shallowReactive(obj) {
    return createReactive(obj, true);
}

function readonly(obj) {
    return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
    return createReactive(obj, true, true)
}