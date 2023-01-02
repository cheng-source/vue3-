// 当读取对象属性时，把副作用函数放进桶里；当设置属性时，把副作用函数从桶里取出并执行
let affectFunction = null;
// effect栈
let effectStact = [];

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
    if (!affectFunction) {
        return target[key];
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

// 触发函数
function trigger(target, key) {
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
    if (typeof source === 'function') {
        getter = source;
    } else {
        getter = () => traverse(source);
    }
    const job = () => {
        newVal = effectFn();
        cb(newVal, oldVal);
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